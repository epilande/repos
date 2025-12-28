import { readdir, stat } from "fs/promises";
import { join } from "path";
import { isGitRepo, getRepoStatus } from "./git.js";
import type { RepoStatus } from "../types.js";

export async function findRepos(
  basePath: string = process.cwd()
): Promise<string[]> {
  const repos: string[] = [];

  try {
    const entries = await readdir(basePath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;

      const fullPath = join(basePath, entry.name);
      if (await isGitRepo(fullPath)) {
        repos.push(fullPath);
      }
    }
  } catch {
  }

  return repos.sort();
}

export function filterRepos(repos: string[], pattern: string): string[] {
  const regexPattern = pattern
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");

  const regex = new RegExp(`^${regexPattern}$`, "i");

  return repos.filter((repo) => {
    const name = repo.split("/").pop() || "";
    return regex.test(name);
  });
}

export async function getAllRepoStatuses(
  repos: string[]
): Promise<RepoStatus[]> {
  const statuses = await Promise.all(repos.map(getRepoStatus));
  return statuses;
}

export async function directoryExists(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

export function getRepoName(repoPath: string): string {
  return repoPath.split("/").pop() || repoPath;
}

export async function runParallel<T, U>(
  items: U[],
  operation: (item: U, index: number) => Promise<T>,
  concurrency: number = 10,
  onProgress?: (completed: number, total: number) => void,
  shouldCancel?: () => boolean
): Promise<{ results: T[]; cancelled: boolean }> {
  const results: T[] = [];
  let completed = 0;
  let index = 0;
  let cancelled = false;

  const runNext = async (): Promise<void> => {
    while (index < items.length) {
      if (shouldCancel?.()) {
        cancelled = true;
        return;
      }
      const currentIndex = index++;
      const item = items[currentIndex];
      const result = await operation(item, currentIndex);
      results[currentIndex] = result;
      completed++;
      onProgress?.(completed, items.length);
    }
  };

  const workers = Array(Math.min(concurrency, items.length))
    .fill(null)
    .map(() => runNext());

  await Promise.all(workers);

  return { results, cancelled };
}

