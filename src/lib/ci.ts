import {
  loadConfig,
  configExists,
  getCwdConfigPath,
  getHomeConfigPath,
  getConfigValue,
  setConfigValue,
  saveConfig,
} from "./config.js";
import {
  findRepos,
  filterRepos,
  runParallel,
  getAllRepoStatuses,
} from "./repos.js";
import {
  getRepoStatus,
  fetchRepo,
  pullRepo,
  cleanRepo,
  diffRepo,
  checkoutBranch,
  execInRepo,
  type FetchRepoOptions,
} from "./git.js";
import type {
  StatusOptions,
  FetchOptions,
  UpdateOptions,
  DiffOptions,
  CheckoutOptions,
  ExecOptions,
  CleanupOptions,
  ConfigOptions,
  RepoStatus,
  RepoOperationResult,
} from "../types.js";
import { DEFAULT_CONFIG } from "../types.js";

// ── Helpers ──────────────────────────────────────────────────────

function pad(str: string, width: number): string {
  return str.length >= width
    ? str.slice(0, width)
    : str + " ".repeat(width - str.length);
}

function formatSync(status: RepoStatus): string {
  if (!status.hasUpstream) return "—";
  if (status.ahead === 0 && status.behind === 0) return "✓";
  const parts: string[] = [];
  if (status.ahead > 0) parts.push(`↑${status.ahead}`);
  if (status.behind > 0) parts.push(`↓${status.behind}`);
  return parts.join(" ");
}

async function resolveRepos(
  basePath?: string,
  filter?: string,
): Promise<string[]> {
  const repoPaths = await findRepos(basePath);
  if (repoPaths.length === 0) {
    console.error("No repositories found in current directory");
    process.exit(1);
  }
  if (filter) {
    const filtered = filterRepos(repoPaths, filter);
    if (filtered.length === 0) {
      console.error(`No repositories match pattern: ${filter}`);
      process.exit(1);
    }
    return filtered;
  }
  return repoPaths;
}

function repoName(repoPath: string): string {
  return repoPath.split("/").pop() || repoPath;
}

// ── Status ───────────────────────────────────────────────────────

export async function ciStatus(options: StatusOptions): Promise<void> {
  const repoPaths = await resolveRepos(options.basePath, options.filter);
  const config = await loadConfig();
  const concurrency = config.parallel ?? 10;

  if (options.fetch) {
    await runParallel(repoPaths, (rp) => fetchRepo(rp), concurrency);
  }

  const { results: statuses } = await runParallel(
    repoPaths,
    (rp) => getRepoStatus(rp),
    concurrency,
  );

  const cleanRepos = statuses.filter(
    (r) => r.isClean && r.ahead === 0 && r.behind === 0,
  );
  const dirtyRepos = statuses.filter(
    (r) => !r.isClean || r.ahead > 0 || r.behind > 0,
  );

  if (options.summary) {
    const modified = statuses.reduce((s, r) => s + r.modified, 0);
    const staged = statuses.reduce((s, r) => s + r.staged, 0);
    const untracked = statuses.reduce((s, r) => s + r.untracked, 0);
    const ahead = statuses.filter((r) => r.ahead > 0).length;
    const behind = statuses.filter((r) => r.behind > 0).length;

    console.log(`Total: ${statuses.length} repositories`);
    console.log(
      `Clean: ${cleanRepos.length}  With changes: ${dirtyRepos.length}`,
    );
    if (dirtyRepos.length > 0) {
      console.log(
        `  Modified: ${modified} | Staged: ${staged} | Untracked: ${untracked}`,
      );
    }
    if (ahead > 0 || behind > 0) {
      console.log(`Ahead: ${ahead} repos  Behind: ${behind} repos`);
    }
    return;
  }

  const repos = options.quiet ? dirtyRepos : statuses;

  if (options.quiet && dirtyRepos.length === 0) {
    console.log(`✓ All ${statuses.length} repositories are clean`);
    return;
  }

  // Table header
  console.log(
    `${pad("Repository", 28)} ${pad("Branch", 14)} ${pad("Modified", 10)} ${pad("Staged", 8)} ${pad("Untracked", 11)} Sync`,
  );
  console.log("─".repeat(77));

  for (const s of repos) {
    const icon = s.isClean && s.ahead === 0 && s.behind === 0 ? "✓" : "●";
    const name = s.name.length > 25 ? s.name.slice(0, 25) + "…" : s.name;
    const branch =
      s.branch.length > 11 ? s.branch.slice(0, 11) + "…" : s.branch;
    console.log(
      `${icon} ${pad(name, 26)} ${pad(branch, 14)} ${pad(String(s.modified), 10)} ${pad(String(s.staged), 8)} ${pad(String(s.untracked), 11)} ${formatSync(s)}`,
    );
  }

  console.log();
  console.log(
    `Repositories: ${statuses.length}  Clean: ${cleanRepos.length}  Changed: ${dirtyRepos.length}`,
  );
}

// ── Fetch ────────────────────────────────────────────────────────

export async function ciFetch(options: FetchOptions): Promise<void> {
  const repoPaths = await resolveRepos(options.basePath, options.filter);
  const config = await loadConfig();
  const concurrency = options.parallel ?? config.parallel ?? 10;

  if (options.dryRun) {
    console.log(`Would fetch ${repoPaths.length} repositories`);
    for (const rp of repoPaths) {
      console.log(`  ${repoName(rp)}`);
    }
    return;
  }

  const fetchOpts: FetchRepoOptions = {
    prune: options.prune,
    all: options.all,
  };

  const { results } = await runParallel(
    repoPaths,
    (rp) => fetchRepo(rp, fetchOpts),
    concurrency,
  );

  const successful = results.filter((r) => r.success);
  const errors = results.filter((r) => !r.success);

  if (!options.quiet) {
    for (const r of results) {
      const icon = r.success ? "✓" : "✗";
      const msg = r.error ? `${r.message} (${r.error})` : r.message;
      console.log(`${icon} ${pad(r.name, 28)} ${msg}`);
    }
    console.log();
  }

  console.log(`Fetched: ${successful.length}  Errors: ${errors.length}`);
}

// ── Pull ─────────────────────────────────────────────────────────

export async function ciPull(options: UpdateOptions): Promise<void> {
  const repoPaths = await resolveRepos(options.basePath, options.filter);
  const config = await loadConfig();
  const concurrency = options.parallel ?? config.parallel ?? 10;

  if (options.dryRun) {
    // Fetch first to check what's behind
    await runParallel(repoPaths, (rp) => fetchRepo(rp), concurrency);
    const { results: statuses } = await runParallel(
      repoPaths,
      (rp) => getRepoStatus(rp),
      concurrency,
    );

    for (const s of statuses) {
      if (s.modified > 0 || s.staged > 0) {
        console.log(`⚠ ${pad(s.name, 28)} skipped (uncommitted changes)`);
      } else if (!s.hasUpstream) {
        console.log(`⚠ ${pad(s.name, 28)} skipped (no upstream)`);
      } else if (s.behind > 0) {
        console.log(
          `↓ ${pad(s.name, 28)} would update (${s.behind} commits behind)`,
        );
      } else {
        console.log(`✓ ${pad(s.name, 28)} up-to-date`);
      }
    }
    return;
  }

  const { results } = await runParallel(
    repoPaths,
    (rp) => pullRepo(rp),
    concurrency,
  );

  const updated = results.filter(
    (r) => r.success && r.message === "updated",
  ).length;
  const upToDate = results.filter(
    (r) => r.success && r.message === "up-to-date",
  ).length;
  const skipped = results.filter((r) => r.message === "skipped").length;
  const errors = results.filter(
    (r) => !r.success && r.message !== "skipped",
  ).length;

  if (!options.quiet) {
    for (const r of results) {
      const icon = r.success
        ? r.message === "updated"
          ? "↓"
          : "✓"
        : r.message === "skipped"
          ? "⚠"
          : "✗";
      const detail = r.details || r.error || "";
      console.log(
        `${icon} ${pad(r.name, 28)} ${r.message}${detail ? ` (${detail})` : ""}`,
      );
    }
    console.log();
  }

  console.log(
    `Updated: ${updated}  Up-to-date: ${upToDate}  Skipped: ${skipped}  Errors: ${errors}`,
  );
}

// ── Diff ─────────────────────────────────────────────────────────

export async function ciDiff(options: DiffOptions): Promise<void> {
  const repoPaths = await resolveRepos(options.basePath, options.filter);
  const config = await loadConfig();
  const concurrency =
    options.parallel ?? config.parallel ?? DEFAULT_CONFIG.parallel;
  const maxLines =
    options.maxLines ?? config.diffMaxLines ?? DEFAULT_CONFIG.diffMaxLines;

  const { results: allResults } = await runParallel(
    repoPaths,
    (rp) => diffRepo(rp),
    concurrency,
  );

  const withDiff = allResults.filter((r) => r.hasDiff);

  if (withDiff.length === 0) {
    console.log("✓ All repositories are clean (no uncommitted changes)");
    return;
  }

  if (options.quiet) {
    console.log(`Repositories with changes (${withDiff.length}):`);
    for (const r of withDiff) {
      console.log(`  ● ${r.name}`);
    }
  } else {
    for (const r of withDiff) {
      console.log(`── ${r.name} ──`);
      const content = options.stat ? r.stat : r.diff;
      const lines = content.split("\n");
      const limit = maxLines === 0 ? lines.length : maxLines;
      console.log(lines.slice(0, limit).join("\n"));
      if (lines.length > limit) {
        console.log(`... ${lines.length - limit} more lines`);
      }
      console.log();
    }
  }

  console.log(
    `Repositories: ${repoPaths.length}  With changes: ${withDiff.length}  Clean: ${repoPaths.length - withDiff.length}`,
  );
}

// ── Checkout ─────────────────────────────────────────────────────

export async function ciCheckout(options: CheckoutOptions): Promise<void> {
  const repoPaths = await resolveRepos(options.basePath, options.filter);
  const config = await loadConfig();
  const concurrency = options.parallel ?? config.parallel ?? 10;

  const { results } = await runParallel(
    repoPaths,
    async (rp) => {
      const name = repoName(rp);
      if (!options.force) {
        const status = await getRepoStatus(rp);
        if (status.modified > 0 || status.staged > 0) {
          return {
            name,
            success: false,
            message: "skipped",
            error: "Has uncommitted changes (use --force to skip)",
          } as RepoOperationResult;
        }
      }
      return checkoutBranch(rp, options.branch, { create: options.create });
    },
    concurrency,
  );

  for (const r of results) {
    const icon = r.success ? "✓" : r.message === "skipped" ? "⚠" : "✗";
    const detail = r.details || r.error || "";
    console.log(
      `${icon} ${pad(r.name, 28)} ${r.message}${detail ? ` (${detail})` : ""}`,
    );
  }

  const switched = results.filter(
    (r) => r.success && r.message === "switched",
  ).length;
  const created = results.filter(
    (r) => r.success && r.message === "created",
  ).length;
  const skipped = results.filter((r) => r.message === "skipped").length;
  const notFound = results.filter((r) => r.message === "not found").length;

  console.log();
  console.log(
    `Switched: ${switched}  Created: ${created}  Skipped: ${skipped}  Not found: ${notFound}`,
  );
}

// ── Exec ─────────────────────────────────────────────────────────

export async function ciExec(options: ExecOptions): Promise<void> {
  const repoPaths = await resolveRepos(options.basePath, options.filter);
  const config = await loadConfig();
  const concurrency = options.parallel ?? config.parallel ?? 10;

  const { results } = await runParallel(
    repoPaths,
    (rp) => execInRepo(rp, options.command),
    concurrency,
  );

  for (const r of results) {
    if (options.quiet && !r.output) continue;
    const icon = r.success ? "✓" : "✗";
    console.log(`${icon} ${r.name}`);
    if (r.output) {
      console.log(
        r.output
          .split("\n")
          .map((l: string) => `  ${l}`)
          .join("\n"),
      );
    }
  }

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  console.log();
  console.log(`Successful: ${successful}  Failed: ${failed}`);
}

// ── Clean ────────────────────────────────────────────────────────

export async function ciClean(options: CleanupOptions): Promise<void> {
  const repoPaths = await resolveRepos(options.basePath, options.filter);
  const statuses = await getAllRepoStatuses(repoPaths);

  const dirty = statuses.filter((s) => {
    if (s.modified > 0 || s.staged > 0 || s.deleted > 0) return true;
    if (options.all && s.untracked > 0) return true;
    return false;
  });

  if (dirty.length === 0) {
    console.log("✓ All repositories are already clean!");
    return;
  }

  if (options.dryRun) {
    console.log(`Would clean ${dirty.length} repositories:`);
    for (const s of dirty) {
      const changes: string[] = [];
      if (s.modified > 0) changes.push(`${s.modified} modified`);
      if (s.staged > 0) changes.push(`${s.staged} staged`);
      if (s.deleted > 0) changes.push(`${s.deleted} deleted`);
      if (options.all && s.untracked > 0)
        changes.push(`${s.untracked} untracked`);
      console.log(`  ● ${s.name} (${changes.join(", ")})`);
    }
    return;
  }

  if (!options.force) {
    console.error(
      "Cannot confirm destructive operation in non-interactive mode. Use --force to skip confirmation or --dry-run to preview.",
    );
    process.exit(1);
  }

  const results: RepoOperationResult[] = [];
  for (const repo of dirty) {
    const result = await cleanRepo(repo.path, options.all);
    results.push(result);
    const icon = result.success ? "✓" : "✗";
    console.log(`${icon} ${result.name} ${result.message}`);
  }

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  console.log();
  console.log(`Cleaned: ${successful}  Failed: ${failed}`);
}

// ── Config ───────────────────────────────────────────────────────

export async function ciConfig(options: ConfigOptions): Promise<void> {
  const config = await loadConfig();

  if (options.get) {
    const value = getConfigValue(config, options.get);
    if (value === undefined) {
      console.error(`Config key not found: ${options.get}`);
      process.exit(1);
    }
    console.log(
      typeof value === "object"
        ? JSON.stringify(value, null, 2)
        : String(value),
    );
    return;
  }

  if (options.set && options.value !== undefined) {
    let parsedValue: unknown = options.value;
    try {
      parsedValue = JSON.parse(options.value);
    } catch {
      // keep as string
    }
    const newConfig = setConfigValue(config, options.set, parsedValue);
    const location = options.location || "cwd";
    await saveConfig(newConfig, location);
    console.log(`Set ${options.set} = ${options.value}`);
    return;
  }

  // List config
  let configPath: string | null = null;
  if (await configExists("cwd")) {
    configPath = getCwdConfigPath();
  } else if (await configExists("home")) {
    configPath = getHomeConfigPath();
  }

  console.log(
    configPath
      ? `Config: ${configPath}`
      : "Using defaults (no config file found)",
  );
  console.log(`github.host:      ${config.github?.host ?? "(not set)"}`);
  console.log(`github.apiUrl:    ${config.github?.apiUrl ?? "(not set)"}`);
  console.log(`org:              ${config.org || "(not set)"}`);
  console.log(`daysThreshold:    ${config.daysThreshold ?? "(not set)"}`);
  console.log(`parallel:         ${config.parallel ?? "(not set)"}`);
  console.log(`timeout:          ${config.timeout ?? "(not set)"}`);
}
