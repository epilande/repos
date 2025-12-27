import { describe, test, expect } from "bun:test";
import { createTempRepoDir } from "../../tests/helpers/temp-repos.js";
import { mkdir, rm } from "fs/promises";
import { join } from "path";
import {
  findRepos,
  filterRepos,
  getAllRepoStatuses,
  directoryExists,
  getRepoName,
  runParallel,
} from "./repos.js";

describe("repos.ts", () => {
  describe("findRepos", () => {
    test("finds all git repositories in a directory", async () => {
      const { basePath, repos, cleanup } = await createTempRepoDir([
        { name: "repo-a" },
        { name: "repo-b" },
        { name: "repo-c" },
      ]);

      try {
        const found = await findRepos(basePath);
        expect(found).toHaveLength(3);
        expect(found.map((r) => r.split("/").pop())).toEqual([
          "repo-a",
          "repo-b",
          "repo-c",
        ]);
      } finally {
        await cleanup();
      }
    });

    test("returns empty array for empty directory", async () => {
      const tempDir = join("/tmp", `empty-${Date.now()}`);
      await mkdir(tempDir, { recursive: true });

      try {
        const found = await findRepos(tempDir);
        expect(found).toHaveLength(0);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });

    test("ignores hidden directories", async () => {
      const tempDir = join("/tmp", `hidden-test-${Date.now()}`);
      await mkdir(tempDir, { recursive: true });

      const { $ } = await import("bun");
      // Create a hidden git repo
      const hiddenPath = join(tempDir, ".hidden-repo");
      await mkdir(hiddenPath, { recursive: true });
      await $`git init ${hiddenPath}`.quiet();

      // Create a normal git repo
      const normalPath = join(tempDir, "normal-repo");
      await mkdir(normalPath, { recursive: true });
      await $`git init ${normalPath}`.quiet();

      try {
        const found = await findRepos(tempDir);
        expect(found).toHaveLength(1);
        expect(found[0]).toContain("normal-repo");
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });

    test("ignores non-git directories", async () => {
      const tempDir = join("/tmp", `mixed-${Date.now()}`);
      await mkdir(tempDir, { recursive: true });

      const { $ } = await import("bun");
      // Create a git repo
      const gitPath = join(tempDir, "git-repo");
      await mkdir(gitPath, { recursive: true });
      await $`git init ${gitPath}`.quiet();

      // Create a non-git directory
      const nonGitPath = join(tempDir, "non-git-dir");
      await mkdir(nonGitPath, { recursive: true });

      try {
        const found = await findRepos(tempDir);
        expect(found).toHaveLength(1);
        expect(found[0]).toContain("git-repo");
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });

    test("returns sorted results", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "zebra" },
        { name: "alpha" },
        { name: "middle" },
      ]);

      try {
        const found = await findRepos(basePath);
        const names = found.map((r) => r.split("/").pop());
        expect(names).toEqual(["alpha", "middle", "zebra"]);
      } finally {
        await cleanup();
      }
    });
  });

  describe("filterRepos", () => {
    const repos = [
      "/path/to/api-server",
      "/path/to/api-client",
      "/path/to/webapp",
      "/path/to/mobile-app",
    ];

    test("filters by exact match", async () => {
      const filtered = filterRepos(repos, "webapp");
      expect(filtered).toHaveLength(1);
      expect(filtered[0]).toContain("webapp");
    });

    test("filters by wildcard prefix", async () => {
      const filtered = filterRepos(repos, "api-*");
      expect(filtered).toHaveLength(2);
      expect(filtered.every((r) => r.includes("api-"))).toBe(true);
    });

    test("filters by wildcard suffix", async () => {
      const filtered = filterRepos(repos, "*-app");
      expect(filtered).toHaveLength(1);
      expect(filtered[0]).toContain("mobile-app");
    });

    test("is case insensitive", async () => {
      const filtered = filterRepos(repos, "WEBAPP");
      expect(filtered).toHaveLength(1);
      expect(filtered[0]).toContain("webapp");
    });

    test("returns empty array when no match", async () => {
      const filtered = filterRepos(repos, "nonexistent");
      expect(filtered).toHaveLength(0);
    });

    test("supports single character wildcard", async () => {
      const filtered = filterRepos(repos, "api-??????");
      expect(filtered).toHaveLength(2);
    });
  });

  describe("getAllRepoStatuses", () => {
    test("gets status for all repos", async () => {
      const { repos, cleanup } = await createTempRepoDir([
        { name: "clean-repo" },
        { name: "dirty-repo", dirty: true },
      ]);

      try {
        const repoPaths = repos.map((r) => r.path);
        const statuses = await getAllRepoStatuses(repoPaths);

        expect(statuses).toHaveLength(2);
        expect(statuses.find((s) => s.name === "clean-repo")?.isClean).toBe(true);
        expect(statuses.find((s) => s.name === "dirty-repo")?.isClean).toBe(false);
      } finally {
        await cleanup();
      }
    });
  });

  describe("directoryExists", () => {
    test("returns true for existing directory", async () => {
      const tempDir = join("/tmp", `exists-${Date.now()}`);
      await mkdir(tempDir, { recursive: true });

      try {
        const exists = await directoryExists(tempDir);
        expect(exists).toBe(true);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });

    test("returns false for non-existent path", async () => {
      const exists = await directoryExists("/non/existent/path");
      expect(exists).toBe(false);
    });

    test("returns false for file paths", async () => {
      const tempDir = join("/tmp", `file-test-${Date.now()}`);
      await mkdir(tempDir, { recursive: true });
      const filePath = join(tempDir, "test.txt");
      await Bun.write(filePath, "test");

      try {
        const exists = await directoryExists(filePath);
        expect(exists).toBe(false);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe("getRepoName", () => {
    test("extracts name from path", () => {
      expect(getRepoName("/path/to/my-repo")).toBe("my-repo");
    });

    test("handles paths with trailing slash", () => {
      expect(getRepoName("my-repo")).toBe("my-repo");
    });

    test("returns path if no separator", () => {
      expect(getRepoName("my-repo")).toBe("my-repo");
    });
  });

  describe("runParallel", () => {
    test("executes operations in parallel", async () => {
      const items = [1, 2, 3, 4, 5];
      const results: number[] = [];

      const { results: output } = await runParallel(
        items,
        async (item) => {
          results.push(item);
          return item * 2;
        },
        3
      );

      expect(output).toEqual([2, 4, 6, 8, 10]);
      expect(results).toHaveLength(5);
    });

    test("respects concurrency limit", async () => {
      const items = [1, 2, 3, 4, 5];
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      await runParallel(
        items,
        async (item) => {
          currentConcurrent++;
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
          await new Promise((resolve) => setTimeout(resolve, 50));
          currentConcurrent--;
          return item;
        },
        2
      );

      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });

    test("calls progress callback", async () => {
      const items = [1, 2, 3];
      const progressCalls: [number, number][] = [];

      await runParallel(
        items,
        async (item) => item,
        2,
        (completed, total) => {
          progressCalls.push([completed, total]);
        }
      );

      expect(progressCalls).toHaveLength(3);
      expect(progressCalls[progressCalls.length - 1]).toEqual([3, 3]);
    });

    test("supports cancellation", async () => {
      const items = [1, 2, 3, 4, 5];
      let processed = 0;
      let shouldCancel = false;

      const { results, cancelled } = await runParallel(
        items,
        async (item) => {
          processed++;
          if (processed >= 2) {
            shouldCancel = true;
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
          return item;
        },
        1, // Sequential to make cancellation predictable
        undefined,
        () => shouldCancel
      );

      expect(cancelled).toBe(true);
      expect(processed).toBeLessThan(items.length);
    });

    test("handles empty items array", async () => {
      const { results } = await runParallel(
        [],
        async (item) => item,
        3
      );

      expect(results).toEqual([]);
    });

    test("preserves order in results", async () => {
      const items = [100, 50, 10, 200, 150];

      const { results } = await runParallel(
        items,
        async (item) => {
          await new Promise((resolve) => setTimeout(resolve, item / 10));
          return item;
        },
        5
      );

      // Results should be in original order, not completion order
      expect(results).toEqual([100, 50, 10, 200, 150]);
    });
  });
});
