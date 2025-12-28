import { $ } from "bun";
import type { RepoStatus, RepoOperationResult } from "../types.js";
import { DEFAULT_CONFIG } from "../types.js";
import { loadConfig } from "./config.js";

const DEFAULT_GIT_TIMEOUT = DEFAULT_CONFIG.timeout;

async function getTimeout(): Promise<number> {
  const config = await loadConfig();
  return config.timeout ?? DEFAULT_GIT_TIMEOUT;
}

class GitTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitTimeoutError";
  }
}

async function runWithTimeout(
  shellPromise: ReturnType<typeof $>,
  timeoutMs: number,
): Promise<Awaited<ReturnType<typeof $>>> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new GitTimeoutError(`timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
  });
  return Promise.race([shellPromise, timeoutPromise]);
}

function isTimeoutError(error: unknown): boolean {
  if (error instanceof GitTimeoutError) return true;
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes("timed out");
  }
  return false;
}

function isConnectionError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("could not resolve host") ||
      msg.includes("connection refused") ||
      msg.includes("network is unreachable") ||
      msg.includes("no route to host") ||
      msg.includes("unable to access")
    );
  }
  return false;
}

function formatNetworkError(error: unknown, operation: string): string {
  if (isTimeoutError(error)) {
    return `${operation} ${error instanceof Error ? error.message : "timed out"}`;
  }
  if (isConnectionError(error)) {
    return `${operation} failed: connection error`;
  }
  return error instanceof Error ? error.message : String(error);
}

const LFS_BYPASS_ENV = {
  GIT_LFS_SKIP_SMUDGE: "1",
  GIT_CONFIG_COUNT: "4",
  GIT_CONFIG_KEY_0: "filter.lfs.smudge",
  GIT_CONFIG_VALUE_0: "cat",
  GIT_CONFIG_KEY_1: "filter.lfs.clean",
  GIT_CONFIG_VALUE_1: "cat",
  GIT_CONFIG_KEY_2: "filter.lfs.process",
  GIT_CONFIG_VALUE_2: "",
  GIT_CONFIG_KEY_3: "filter.lfs.required",
  GIT_CONFIG_VALUE_3: "false",
};

export async function isGitRepo(path: string): Promise<boolean> {
  try {
    const result = await $`git -C ${path} rev-parse --git-dir`.quiet();
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function getCurrentBranch(repoPath: string): Promise<string> {
  try {
    const result = await $`git -C ${repoPath} branch --show-current`.quiet();
    const branch = result.text().trim();
    return branch || "detached";
  } catch {
    return "detached";
  }
}

export async function getRepoStatus(repoPath: string): Promise<RepoStatus> {
  const name = repoPath.split("/").pop() || repoPath;
  const branch = await getCurrentBranch(repoPath);

  let modified = 0;
  let staged = 0;
  let untracked = 0;
  let deleted = 0;

  try {
    const statusResult = await $`git -C ${repoPath} status --porcelain`.quiet();
    // Split first, then filter - don't use trim() as it removes leading spaces
    // which are significant in git porcelain output (e.g., " M file.txt")
    const statusLines = statusResult.text().split("\n").filter((line) => line.length >= 2);

    for (const line of statusLines) {
      const indexStatus = line[0];
      const worktreeStatus = line[1];

      if (indexStatus !== " " && indexStatus !== "?") staged++;
      if (worktreeStatus === "M") modified++;
      else if (worktreeStatus === "D") deleted++;
      if (indexStatus === "?") untracked++;
    }
  } catch {
  }
  let ahead = 0;
  let behind = 0;
  let hasUpstream = false;

  try {
    const upstreamResult =
      await $`git -C ${repoPath} rev-parse --abbrev-ref --symbolic-full-name @{u}`.quiet();
    if (upstreamResult.exitCode === 0) {
      hasUpstream = true;
      const upstream = upstreamResult.text().trim();

      const aheadResult =
        await $`git -C ${repoPath} rev-list --count HEAD..${upstream}`.quiet();
      behind = parseInt(aheadResult.text().trim()) || 0;

      const behindResult =
        await $`git -C ${repoPath} rev-list --count ${upstream}..HEAD`.quiet();
      ahead = parseInt(behindResult.text().trim()) || 0;
    }
  } catch {
  }

  const isClean =
    modified === 0 && staged === 0 && untracked === 0 && deleted === 0;

  return {
    name,
    path: repoPath,
    branch,
    modified,
    staged,
    untracked,
    deleted,
    ahead,
    behind,
    isClean,
    hasUpstream,
  };
}

export async function pullRepo(repoPath: string): Promise<RepoOperationResult> {
  const name = repoPath.split("/").pop() || repoPath;
  const timeout = await getTimeout();

  try {
    const status = await getRepoStatus(repoPath);
    if (status.modified > 0 || status.staged > 0) {
      return {
        name,
        success: false,
        message: "skipped",
        error: "Has uncommitted changes",
      };
    }

    if (!status.hasUpstream) {
      return {
        name,
        success: false,
        message: "skipped",
        error: "No upstream configured",
      };
    }

    const result = await runWithTimeout(
      $`git -C ${repoPath} pull`.quiet().nothrow(),
      timeout,
    );
    const output = result.text();

    if (result.exitCode !== 0) {
      return {
        name,
        success: false,
        message: "error",
        error: output || "Pull failed",
      };
    }

    if (output.includes("Already up to date")) {
      return {
        name,
        success: true,
        message: "up-to-date",
      };
    }

    const fileMatch = output.match(/(\d+) file/);
    const fileCount = fileMatch ? fileMatch[1] : "some";

    return {
      name,
      success: true,
      message: "updated",
      details: `${fileCount} file(s) changed`,
    };
  } catch (error) {
    return {
      name,
      success: false,
      message: "error",
      error: formatNetworkError(error, "Pull"),
    };
  }
}

export async function cleanRepo(
  repoPath: string,
  includeUntracked: boolean = false,
): Promise<RepoOperationResult> {
  const name = repoPath.split("/").pop() || repoPath;

  try {
    const status = await getRepoStatus(repoPath);
    const totalChanges = status.modified + status.staged + status.deleted;
    let filesReverted = 0;
    let filesRemoved = 0;

    // Bypass LFS to avoid requiring git-lfs for cleanup
    if (totalChanges > 0) {
      const resetResult = await $`git -C ${repoPath} reset --hard HEAD`
        .env(LFS_BYPASS_ENV)
        .quiet()
        .nothrow();
      if (resetResult.exitCode !== 0) {
        const errorOutput =
          resetResult.stderr.toString().trim() || resetResult.text().trim();
        return {
          name,
          success: false,
          message: "error",
          error: errorOutput || "Failed to reset changes",
        };
      }
      filesReverted = totalChanges;
    }

    if (includeUntracked && status.untracked > 0) {
      const cleanResult = await $`git -C ${repoPath} clean -fd`
        .env(LFS_BYPASS_ENV)
        .quiet()
        .nothrow();
      if (cleanResult.exitCode !== 0) {
        const errorOutput =
          cleanResult.stderr.toString().trim() || cleanResult.text().trim();
        return {
          name,
          success: false,
          message: "error",
          error: errorOutput || "Failed to clean untracked files",
        };
      }
      filesRemoved = status.untracked;
    }

    if (filesReverted === 0 && filesRemoved === 0) {
      return {
        name,
        success: true,
        message: "already clean",
      };
    }

    const details: string[] = [];
    if (filesReverted > 0) details.push(`${filesReverted} reverted`);
    if (filesRemoved > 0) details.push(`${filesRemoved} removed`);

    return {
      name,
      success: true,
      message: "cleaned",
      details: details.join(", "),
    };
  } catch (error) {
    return {
      name,
      success: false,
      message: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export interface CloneRepoOptions {
  shallow?: boolean;
  depth?: number;
}

export async function cloneRepo(
  url: string,
  targetPath: string,
  options: CloneRepoOptions = {},
): Promise<RepoOperationResult> {
  const name = targetPath.split("/").pop() || targetPath;
  const timeout = await getTimeout();

  try {
    const args = ["clone"];

    if (options.shallow) {
      args.push("--depth", String(options.depth ?? 1));
      args.push("--single-branch");
    }

    args.push(url, targetPath);

    const result = await runWithTimeout(
      $`git ${args}`.quiet().nothrow(),
      timeout,
    );

    if (result.exitCode !== 0) {
      const output = result.text() || result.stderr.toString();
      return {
        name,
        success: false,
        message: "error",
        error: output || "Clone failed",
      };
    }

    return {
      name,
      success: true,
      message: "cloned",
      details: options.shallow ? "shallow" : undefined,
    };
  } catch (error) {
    return {
      name,
      success: false,
      message: "error",
      error: formatNetworkError(error, "Clone"),
    };
  }
}

export interface FetchRepoOptions {
  prune?: boolean;
  all?: boolean;
}

export async function fetchRepo(
  repoPath: string,
  options: FetchRepoOptions = {},
): Promise<RepoOperationResult> {
  const name = repoPath.split("/").pop() || repoPath;
  const timeout = await getTimeout();

  try {
    const args = ["-C", repoPath, "fetch"];

    if (options.prune) {
      args.push("--prune");
    }

    if (options.all) {
      args.push("--all");
    }

    const result = await runWithTimeout(
      $`git ${args}`.quiet().nothrow(),
      timeout,
    );

    if (result.exitCode !== 0) {
      const output = result.text() || result.stderr.toString();
      return {
        name,
        success: false,
        message: "error",
        error: output || "Fetch failed",
      };
    }

    return {
      name,
      success: true,
      message: "fetched",
    };
  } catch (error) {
    return {
      name,
      success: false,
      message: "error",
      error: formatNetworkError(error, "Fetch"),
    };
  }
}

export interface DiffResult {
  name: string;
  hasDiff: boolean;
  diff: string;
  stat: string;
}

export async function diffRepo(repoPath: string): Promise<DiffResult> {
  const name = repoPath.split("/").pop() || repoPath;

  try {
    const diffResult = await $`git -C ${repoPath} diff`.quiet().nothrow();
    const diff = diffResult.text().trim();

    const statResult = await $`git -C ${repoPath} diff --stat`.quiet().nothrow();
    const stat = statResult.text().trim();

    return {
      name,
      hasDiff: diff.length > 0,
      diff,
      stat,
    };
  } catch (error) {
    return {
      name,
      hasDiff: false,
      diff: "",
      stat: "",
    };
  }
}

export interface CheckoutOptions {
  create?: boolean;
}

export async function checkoutBranch(
  repoPath: string,
  branch: string,
  options: CheckoutOptions = {},
): Promise<RepoOperationResult> {
  const name = repoPath.split("/").pop() || repoPath;

  try {
    const args = ["-C", repoPath, "checkout"];

    if (options.create) {
      args.push("-b");
    }

    args.push(branch);

    const result = await $`git ${args}`.quiet().nothrow();

    if (result.exitCode !== 0) {
      const output = result.text() || result.stderr.toString();

      // Check if branch doesn't exist
      if (output.includes("did not match any") || output.includes("pathspec")) {
        return {
          name,
          success: false,
          message: "not found",
          error: `Branch '${branch}' not found`,
        };
      }

      // Check if branch already exists when trying to create
      if (output.includes("already exists")) {
        return {
          name,
          success: false,
          message: "exists",
          error: `Branch '${branch}' already exists`,
        };
      }

      return {
        name,
        success: false,
        message: "error",
        error: output || "Checkout failed",
      };
    }

    return {
      name,
      success: true,
      message: options.create ? "created" : "switched",
      details: `→ ${branch}`,
    };
  } catch (error) {
    return {
      name,
      success: false,
      message: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export interface ExecResult {
  name: string;
  success: boolean;
  exitCode: number;
  output: string;
  error?: string;
}

export async function execInRepo(
  repoPath: string,
  command: string,
): Promise<ExecResult> {
  const name = repoPath.split("/").pop() || repoPath;
  const timeout = await getTimeout();

  try {
    const result = await runWithTimeout(
      $`sh -c ${command}`.cwd(repoPath).quiet().nothrow(),
      timeout,
    );

    const output = result.text().trim();
    const stderr = result.stderr.toString().trim();

    return {
      name,
      success: result.exitCode === 0,
      exitCode: result.exitCode,
      output: output || stderr,
      error: result.exitCode !== 0 ? stderr || output : undefined,
    };
  } catch (error) {
    return {
      name,
      success: false,
      exitCode: 1,
      output: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
