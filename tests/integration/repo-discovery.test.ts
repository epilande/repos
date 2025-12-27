import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { $ } from "bun";
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { findRepos, filterRepos, getAllRepoStatuses } from "../../src/lib/repos.js";

describe("Repository Discovery Integration", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = `/tmp/repo-discovery-integration-${Date.now()}`;
    await mkdir(tempDir, { recursive: true });
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("findRepos", () => {
    test("finds all git repositories in directory", async () => {
      // Create multiple repos
      await $`git init repo-a`.quiet();
      await $`git init repo-b`.quiet();
      await $`git init repo-c`.quiet();

      const repos = await findRepos();

      expect(repos.length).toBe(3);
      expect(repos.map(r => r.split("/").pop())).toContain("repo-a");
      expect(repos.map(r => r.split("/").pop())).toContain("repo-b");
      expect(repos.map(r => r.split("/").pop())).toContain("repo-c");
    });

    test("returns empty array when no repos found", async () => {
      // Create non-repo directories
      await mkdir("not-a-repo", { recursive: true });
      await mkdir("also-not-a-repo", { recursive: true });

      const repos = await findRepos();

      expect(repos.length).toBe(0);
    });

    test("ignores hidden directories", async () => {
      await $`git init visible-repo`.quiet();
      await $`git init .hidden-repo`.quiet();

      const repos = await findRepos();

      expect(repos.length).toBe(1);
      expect(repos[0]).toContain("visible-repo");
    });

    test("ignores node_modules directories", async () => {
      await $`git init real-repo`.quiet();
      await mkdir("node_modules", { recursive: true });
      await $`git init node_modules/some-package`.quiet();

      const repos = await findRepos();

      expect(repos.length).toBe(1);
      expect(repos[0]).toContain("real-repo");
    });
  });

  describe("filterRepos", () => {
    test("filters by exact name match", async () => {
      await $`git init api-server`.quiet();
      await $`git init web-client`.quiet();
      await $`git init mobile-app`.quiet();

      const repos = await findRepos();
      const filtered = filterRepos(repos, "api-server");

      expect(filtered.length).toBe(1);
      expect(filtered[0]).toContain("api-server");
    });

    test("filters by wildcard pattern", async () => {
      await $`git init api-server`.quiet();
      await $`git init api-client`.quiet();
      await $`git init web-server`.quiet();

      const repos = await findRepos();
      const filtered = filterRepos(repos, "api-*");

      expect(filtered.length).toBe(2);
      expect(filtered.some(r => r.includes("api-server"))).toBe(true);
      expect(filtered.some(r => r.includes("api-client"))).toBe(true);
      expect(filtered.some(r => r.includes("web-server"))).toBe(false);
    });

    test("filters case-insensitively", async () => {
      await $`git init MyProject`.quiet();
      await $`git init myproject-utils`.quiet();

      const repos = await findRepos();
      const filtered = filterRepos(repos, "myproject*");

      expect(filtered.length).toBe(2);
    });

    test("supports multiple wildcard patterns", async () => {
      await $`git init foo-bar-baz`.quiet();
      await $`git init foo-bar`.quiet();
      await $`git init bar-baz`.quiet();

      const repos = await findRepos();
      const filtered = filterRepos(repos, "foo-*-*");

      expect(filtered.length).toBe(1);
      expect(filtered[0]).toContain("foo-bar-baz");
    });
  });

  describe("getAllRepoStatuses", () => {
    test("returns status for all repos", async () => {
      // Create repos
      await $`git init --initial-branch=main clean-repo`.quiet();
      await $`git -C clean-repo config user.email "test@test.com"`.quiet();
      await $`git -C clean-repo config user.name "Test"`.quiet();
      await writeFile("clean-repo/README.md", "# Clean");
      await $`git -C clean-repo add .`.quiet();
      await $`git -C clean-repo commit -m "Initial"`.quiet();

      await $`git init --initial-branch=main dirty-repo`.quiet();
      await $`git -C dirty-repo config user.email "test@test.com"`.quiet();
      await $`git -C dirty-repo config user.name "Test"`.quiet();
      await writeFile("dirty-repo/README.md", "# Original");
      await $`git -C dirty-repo add .`.quiet();
      await $`git -C dirty-repo commit -m "Initial"`.quiet();
      await writeFile("dirty-repo/README.md", "# Modified");

      const repos = await findRepos();
      const statuses = await getAllRepoStatuses(repos);

      expect(statuses.length).toBe(2);

      const cleanStatus = statuses.find(s => s.name === "clean-repo");
      const dirtyStatus = statuses.find(s => s.name === "dirty-repo");

      expect(cleanStatus?.modified).toBe(0);
      expect(dirtyStatus?.modified).toBe(1);
    });

    test("returns status with correct branch info", async () => {
      await $`git init --initial-branch=develop my-repo`.quiet();
      await $`git -C my-repo config user.email "test@test.com"`.quiet();
      await $`git -C my-repo config user.name "Test"`.quiet();
      await writeFile("my-repo/README.md", "# Test");
      await $`git -C my-repo add .`.quiet();
      await $`git -C my-repo commit -m "Initial"`.quiet();

      const repos = await findRepos();
      const statuses = await getAllRepoStatuses(repos);

      expect(statuses.length).toBe(1);
      expect(statuses[0].branch).toBe("develop");
    });
  });
});
