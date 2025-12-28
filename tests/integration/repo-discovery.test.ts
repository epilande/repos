import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { $ } from "bun";
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { findRepos, filterRepos, getAllRepoStatuses } from "../../src/lib/repos.js";

describe("Repository Discovery Integration", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = `/tmp/repo-discovery-integration-${Date.now()}`;
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("findRepos", () => {
    test("finds all git repositories in directory", async () => {
      // Create multiple repos
      await $`git init ${join(tempDir, "repo-a")}`.quiet();
      await $`git init ${join(tempDir, "repo-b")}`.quiet();
      await $`git init ${join(tempDir, "repo-c")}`.quiet();

      const repos = await findRepos(tempDir);

      expect(repos.length).toBe(3);
      expect(repos.map(r => r.split("/").pop())).toContain("repo-a");
      expect(repos.map(r => r.split("/").pop())).toContain("repo-b");
      expect(repos.map(r => r.split("/").pop())).toContain("repo-c");
    });

    test("returns empty array when no repos found", async () => {
      // Create non-repo directories
      await mkdir(join(tempDir, "not-a-repo"), { recursive: true });
      await mkdir(join(tempDir, "also-not-a-repo"), { recursive: true });

      const repos = await findRepos(tempDir);

      expect(repos.length).toBe(0);
    });

    test("ignores hidden directories", async () => {
      await $`git init ${join(tempDir, "visible-repo")}`.quiet();
      await $`git init ${join(tempDir, ".hidden-repo")}`.quiet();

      const repos = await findRepos(tempDir);

      expect(repos.length).toBe(1);
      expect(repos[0]).toContain("visible-repo");
    });

    test("ignores node_modules directories", async () => {
      await $`git init ${join(tempDir, "real-repo")}`.quiet();
      await mkdir(join(tempDir, "node_modules"), { recursive: true });
      await $`git init ${join(tempDir, "node_modules/some-package")}`.quiet();

      const repos = await findRepos(tempDir);

      expect(repos.length).toBe(1);
      expect(repos[0]).toContain("real-repo");
    });
  });

  describe("filterRepos", () => {
    test("filters by exact name match", async () => {
      await $`git init ${join(tempDir, "api-server")}`.quiet();
      await $`git init ${join(tempDir, "web-client")}`.quiet();
      await $`git init ${join(tempDir, "mobile-app")}`.quiet();

      const repos = await findRepos(tempDir);
      const filtered = filterRepos(repos, "api-server");

      expect(filtered.length).toBe(1);
      expect(filtered[0]).toContain("api-server");
    });

    test("filters by wildcard pattern", async () => {
      await $`git init ${join(tempDir, "api-server")}`.quiet();
      await $`git init ${join(tempDir, "api-client")}`.quiet();
      await $`git init ${join(tempDir, "web-server")}`.quiet();

      const repos = await findRepos(tempDir);
      const filtered = filterRepos(repos, "api-*");

      expect(filtered.length).toBe(2);
      expect(filtered.some(r => r.includes("api-server"))).toBe(true);
      expect(filtered.some(r => r.includes("api-client"))).toBe(true);
      expect(filtered.some(r => r.includes("web-server"))).toBe(false);
    });

    test("filters case-insensitively", async () => {
      await $`git init ${join(tempDir, "MyProject")}`.quiet();
      await $`git init ${join(tempDir, "myproject-utils")}`.quiet();

      const repos = await findRepos(tempDir);
      const filtered = filterRepos(repos, "myproject*");

      expect(filtered.length).toBe(2);
    });

    test("supports multiple wildcard patterns", async () => {
      await $`git init ${join(tempDir, "foo-bar-baz")}`.quiet();
      await $`git init ${join(tempDir, "foo-bar")}`.quiet();
      await $`git init ${join(tempDir, "bar-baz")}`.quiet();

      const repos = await findRepos(tempDir);
      const filtered = filterRepos(repos, "foo-*-*");

      expect(filtered.length).toBe(1);
      expect(filtered[0]).toContain("foo-bar-baz");
    });
  });

  describe("getAllRepoStatuses", () => {
    test("returns status for all repos", async () => {
      // Create repos
      const cleanRepoPath = join(tempDir, "clean-repo");
      const dirtyRepoPath = join(tempDir, "dirty-repo");

      await $`git init --initial-branch=main ${cleanRepoPath}`.quiet();
      await $`git -C ${cleanRepoPath} config user.email "test@test.com"`.quiet();
      await $`git -C ${cleanRepoPath} config user.name "Test"`.quiet();
      await writeFile(join(cleanRepoPath, "README.md"), "# Clean");
      await $`git -C ${cleanRepoPath} add .`.quiet();
      await $`git -C ${cleanRepoPath} commit -m "Initial"`.quiet();

      await $`git init --initial-branch=main ${dirtyRepoPath}`.quiet();
      await $`git -C ${dirtyRepoPath} config user.email "test@test.com"`.quiet();
      await $`git -C ${dirtyRepoPath} config user.name "Test"`.quiet();
      await writeFile(join(dirtyRepoPath, "README.md"), "# Original");
      await $`git -C ${dirtyRepoPath} add .`.quiet();
      await $`git -C ${dirtyRepoPath} commit -m "Initial"`.quiet();
      await writeFile(join(dirtyRepoPath, "README.md"), "# Modified");

      const repos = await findRepos(tempDir);
      const statuses = await getAllRepoStatuses(repos);

      expect(statuses.length).toBe(2);

      const cleanStatus = statuses.find(s => s.name === "clean-repo");
      const dirtyStatus = statuses.find(s => s.name === "dirty-repo");

      expect(cleanStatus?.modified).toBe(0);
      expect(dirtyStatus?.modified).toBe(1);
    });

    test("returns status with correct branch info", async () => {
      const repoPath = join(tempDir, "my-repo");

      await $`git init --initial-branch=develop ${repoPath}`.quiet();
      await $`git -C ${repoPath} config user.email "test@test.com"`.quiet();
      await $`git -C ${repoPath} config user.name "Test"`.quiet();
      await writeFile(join(repoPath, "README.md"), "# Test");
      await $`git -C ${repoPath} add .`.quiet();
      await $`git -C ${repoPath} commit -m "Initial"`.quiet();

      const repos = await findRepos(tempDir);
      const statuses = await getAllRepoStatuses(repos);

      expect(statuses.length).toBe(1);
      expect(statuses[0].branch).toBe("develop");
    });
  });
});
