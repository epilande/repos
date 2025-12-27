import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { $ } from "bun";
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { runParallel } from "../../src/lib/repos.js";

describe("Parallel Operations Integration", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = `/tmp/parallel-ops-integration-${Date.now()}`;
    await mkdir(tempDir, { recursive: true });
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("runParallel", () => {
    test("executes operations in parallel", async () => {
      const items = [1, 2, 3, 4, 5];
      const executionOrder: number[] = [];

      const { results } = await runParallel(
        items,
        async (item) => {
          // Simulate async work with random delay
          await new Promise(r => setTimeout(r, Math.random() * 50));
          executionOrder.push(item);
          return item * 2;
        },
        5
      );

      expect(results.length).toBe(5);
      expect(results.every((r, i) => r === items[i] * 2)).toBe(true);
      // Results should maintain order even if execution was parallel
      expect(results).toEqual([2, 4, 6, 8, 10]);
    });

    test("respects concurrency limit", async () => {
      const concurrency = 2;
      let maxConcurrent = 0;
      let currentConcurrent = 0;
      const items = [1, 2, 3, 4, 5, 6];

      await runParallel(
        items,
        async (item) => {
          currentConcurrent++;
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
          await new Promise(r => setTimeout(r, 50));
          currentConcurrent--;
          return item;
        },
        concurrency
      );

      expect(maxConcurrent).toBeLessThanOrEqual(concurrency);
    });

    test("reports progress correctly", async () => {
      const items = [1, 2, 3, 4, 5];
      const progressReports: { completed: number; total: number }[] = [];

      await runParallel(
        items,
        async (item) => {
          await new Promise(r => setTimeout(r, 10));
          return item;
        },
        2,
        (completed, total) => {
          progressReports.push({ completed, total });
        }
      );

      // Should have progress reports
      expect(progressReports.length).toBeGreaterThan(0);
      // Last report should show all completed
      const lastReport = progressReports[progressReports.length - 1];
      expect(lastReport.completed).toBe(5);
      expect(lastReport.total).toBe(5);
    });

    test("supports cancellation", async () => {
      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      let processedCount = 0;
      let shouldCancel = false;

      // Cancel after 3 items
      const { results, cancelled } = await runParallel(
        items,
        async (item) => {
          if (processedCount >= 3) {
            shouldCancel = true;
          }
          await new Promise(r => setTimeout(r, 30));
          processedCount++;
          return item;
        },
        2,
        undefined,
        () => shouldCancel
      );

      expect(cancelled).toBe(true);
      expect(results.length).toBeLessThan(items.length);
    });

    test("handles errors in callback when wrapped", async () => {
      const items = [1, 2, 3, 4, 5];

      const { results } = await runParallel(
        items,
        async (item) => {
          try {
            if (item === 3) {
              throw new Error("Test error");
            }
            return { value: item * 2, error: null };
          } catch (err) {
            return { value: null, error: err instanceof Error ? err.message : "unknown" };
          }
        },
        5
      );

      // All items should have results
      expect(results.length).toBe(5);

      const successResults = results.filter(r => r?.value !== null);
      const errorResults = results.filter(r => r?.error !== null);

      expect(successResults.length).toBe(4);
      expect(errorResults.length).toBe(1);
      expect(errorResults[0]?.error).toBe("Test error");
    });
  });

  describe("parallel git operations", () => {
    test("performs parallel status checks", async () => {
      // Create multiple repos
      for (let i = 1; i <= 5; i++) {
        const repoName = `repo-${i}`;
        await $`git init --initial-branch=main ${repoName}`.quiet();
        await $`git -C ${repoName} config user.email "test@test.com"`.quiet();
        await $`git -C ${repoName} config user.name "Test"`.quiet();
        await writeFile(join(repoName, "README.md"), `# Repo ${i}`);
        await $`git -C ${repoName} add .`.quiet();
        await $`git -C ${repoName} commit -m "Initial commit"`.quiet();

        // Make some dirty
        if (i % 2 === 0) {
          await writeFile(join(repoName, "README.md"), `# Modified ${i}`);
        }
      }

      const repoPaths = Array.from({ length: 5 }, (_, i) => join(tempDir, `repo-${i + 1}`));

      const { results } = await runParallel(
        repoPaths,
        async (repoPath) => {
          const result = await $`git -C ${repoPath} status --porcelain`.quiet();
          return {
            path: repoPath,
            isDirty: result.text().trim().length > 0
          };
        },
        5
      );

      expect(results.length).toBe(5);

      const dirtyRepos = results.filter(r => r?.isDirty);
      const cleanRepos = results.filter(r => r && !r.isDirty);

      expect(dirtyRepos.length).toBe(2); // repos 2 and 4
      expect(cleanRepos.length).toBe(3); // repos 1, 3, and 5
    });

    test("performs parallel branch checkout", async () => {
      // Create multiple repos with a common branch
      for (let i = 1; i <= 3; i++) {
        const repoName = `branch-repo-${i}`;
        await $`git init --initial-branch=main ${repoName}`.quiet();
        await $`git -C ${repoName} config user.email "test@test.com"`.quiet();
        await $`git -C ${repoName} config user.name "Test"`.quiet();
        await writeFile(join(repoName, "README.md"), `# Repo ${i}`);
        await $`git -C ${repoName} add .`.quiet();
        await $`git -C ${repoName} commit -m "Initial commit"`.quiet();
        await $`git -C ${repoName} branch feature-branch`.quiet();
      }

      const repoPaths = Array.from({ length: 3 }, (_, i) => join(tempDir, `branch-repo-${i + 1}`));

      const { results } = await runParallel(
        repoPaths,
        async (repoPath) => {
          await $`git -C ${repoPath} checkout feature-branch`.quiet();
          const branch = (await $`git -C ${repoPath} branch --show-current`.quiet()).text().trim();
          return { path: repoPath, branch };
        },
        3
      );

      expect(results.length).toBe(3);
      expect(results.every(r => r?.branch === "feature-branch")).toBe(true);
    });
  });
});
