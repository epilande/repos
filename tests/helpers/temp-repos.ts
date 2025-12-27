import { $ } from "bun";
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

export interface TempRepo {
  path: string;
  name: string;
  cleanup: () => Promise<void>;
}

export interface TempRepoOptions {
  name?: string;
  branch?: string;
  files?: Record<string, string>;
  commits?: { message: string; files?: Record<string, string> }[];
  withRemote?: boolean;
  dirty?: boolean;
  staged?: boolean;
}

/**
 * Create a temporary git repository for testing
 */
export async function createTempRepo(options: TempRepoOptions = {}): Promise<TempRepo> {
  const basePath = join(tmpdir(), "repos-test");
  await mkdir(basePath, { recursive: true });

  const name = options.name || `test-repo-${randomUUID().slice(0, 8)}`;
  const repoPath = join(basePath, name);

  // Clean up if it exists
  await rm(repoPath, { recursive: true, force: true });
  await mkdir(repoPath, { recursive: true });

  // Initialize git repo
  await $`git init ${repoPath}`.quiet();
  await $`git -C ${repoPath} config user.email "test@test.com"`.quiet();
  await $`git -C ${repoPath} config user.name "Test User"`.quiet();

  // Set default branch
  const branch = options.branch || "main";
  await $`git -C ${repoPath} checkout -b ${branch}`.quiet().nothrow();

  // Create initial files
  const files = options.files || { "README.md": "# Test Repo" };
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = join(repoPath, filePath);
    await mkdir(join(fullPath, ".."), { recursive: true });
    await writeFile(fullPath, content);
  }

  // Create initial commit
  await $`git -C ${repoPath} add -A`.quiet();
  await $`git -C ${repoPath} commit -m "Initial commit"`.quiet();

  // Create additional commits
  if (options.commits) {
    for (const commit of options.commits) {
      if (commit.files) {
        for (const [filePath, content] of Object.entries(commit.files)) {
          const fullPath = join(repoPath, filePath);
          await mkdir(join(fullPath, ".."), { recursive: true });
          await writeFile(fullPath, content);
        }
        await $`git -C ${repoPath} add -A`.quiet();
      }
      await $`git -C ${repoPath} commit --allow-empty -m ${commit.message}`.quiet();
    }
  }

  // Add dirty changes if requested
  if (options.dirty) {
    await writeFile(join(repoPath, "dirty-file.txt"), "uncommitted changes");
  }

  // Add staged changes if requested
  if (options.staged) {
    await writeFile(join(repoPath, "staged-file.txt"), "staged changes");
    await $`git -C ${repoPath} add staged-file.txt`.quiet();
  }

  return {
    path: repoPath,
    name,
    cleanup: async () => {
      await rm(repoPath, { recursive: true, force: true });
    },
  };
}

/**
 * Create multiple temporary repos in a parent directory
 */
export async function createTempRepoDir(
  repos: TempRepoOptions[]
): Promise<{ basePath: string; repos: TempRepo[]; cleanup: () => Promise<void> }> {
  const basePath = join(tmpdir(), `repos-test-${randomUUID().slice(0, 8)}`);
  await mkdir(basePath, { recursive: true });

  const createdRepos: TempRepo[] = [];

  for (const repoOptions of repos) {
    const name = repoOptions.name || `repo-${createdRepos.length + 1}`;
    const repoPath = join(basePath, name);

    await mkdir(repoPath, { recursive: true });
    await $`git init ${repoPath}`.quiet();
    await $`git -C ${repoPath} config user.email "test@test.com"`.quiet();
    await $`git -C ${repoPath} config user.name "Test User"`.quiet();

    const branch = repoOptions.branch || "main";
    await $`git -C ${repoPath} checkout -b ${branch}`.quiet().nothrow();

    const files = repoOptions.files || { "README.md": `# ${name}` };
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = join(repoPath, filePath);
      await mkdir(join(fullPath, ".."), { recursive: true });
      await writeFile(fullPath, content);
    }

    await $`git -C ${repoPath} add -A`.quiet();
    await $`git -C ${repoPath} commit -m "Initial commit"`.quiet();

    if (repoOptions.dirty) {
      await writeFile(join(repoPath, "dirty-file.txt"), "uncommitted changes");
    }

    if (repoOptions.staged) {
      await writeFile(join(repoPath, "staged-file.txt"), "staged changes");
      await $`git -C ${repoPath} add staged-file.txt`.quiet();
    }

    createdRepos.push({
      path: repoPath,
      name,
      cleanup: async () => {
        await rm(repoPath, { recursive: true, force: true });
      },
    });
  }

  return {
    basePath,
    repos: createdRepos,
    cleanup: async () => {
      await rm(basePath, { recursive: true, force: true });
    },
  };
}
