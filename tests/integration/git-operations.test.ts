import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { $ } from "bun";
import { mkdir, rm, writeFile, readFile } from "fs/promises";
import { join } from "path";
import {
  isGitRepo,
  getCurrentBranch,
  getRepoStatus,
  checkoutBranch,
  execInRepo,
  cleanRepo,
} from "../../src/lib/git.js";

describe("Git Operations Integration", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = `/tmp/git-ops-integration-${Date.now()}`;
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("isGitRepo", () => {
    test("returns true for valid git repository", async () => {
      const repoPath = join(tempDir, "valid-repo");
      await $`git init ${repoPath}`.quiet();

      const result = await isGitRepo(repoPath);
      expect(result).toBe(true);
    });

    test("returns false for non-git directory", async () => {
      const nonRepoPath = join(tempDir, "non-repo");
      await mkdir(nonRepoPath, { recursive: true });

      const result = await isGitRepo(nonRepoPath);
      expect(result).toBe(false);
    });

    test("returns false for non-existent path", async () => {
      const result = await isGitRepo(join(tempDir, "does-not-exist"));
      expect(result).toBe(false);
    });
  });

  describe("getCurrentBranch", () => {
    test("returns default branch name for new repo", async () => {
      const repoPath = join(tempDir, "new-repo");
      await $`git init --initial-branch=main ${repoPath}`.quiet();
      await $`git -C ${repoPath} config user.email "test@test.com"`.quiet();
      await $`git -C ${repoPath} config user.name "Test"`.quiet();
      await writeFile(join(repoPath, "README.md"), "# Test");
      await $`git -C ${repoPath} add .`.quiet();
      await $`git -C ${repoPath} commit -m "Initial commit"`.quiet();

      const branch = await getCurrentBranch(repoPath);
      expect(branch).toBe("main");
    });

    test("returns custom branch name after checkout", async () => {
      const repoPath = join(tempDir, "branch-repo");
      await $`git init --initial-branch=main ${repoPath}`.quiet();
      await $`git -C ${repoPath} config user.email "test@test.com"`.quiet();
      await $`git -C ${repoPath} config user.name "Test"`.quiet();
      await writeFile(join(repoPath, "README.md"), "# Test");
      await $`git -C ${repoPath} add .`.quiet();
      await $`git -C ${repoPath} commit -m "Initial commit"`.quiet();
      await $`git -C ${repoPath} checkout -b feature-branch`.quiet();

      const branch = await getCurrentBranch(repoPath);
      expect(branch).toBe("feature-branch");
    });
  });

  describe("getRepoStatus", () => {
    test("returns clean status for unmodified repo", async () => {
      const repoPath = join(tempDir, "clean-repo");
      await $`git init --initial-branch=main ${repoPath}`.quiet();
      await $`git -C ${repoPath} config user.email "test@test.com"`.quiet();
      await $`git -C ${repoPath} config user.name "Test"`.quiet();
      await writeFile(join(repoPath, "README.md"), "# Test");
      await $`git -C ${repoPath} add .`.quiet();
      await $`git -C ${repoPath} commit -m "Initial commit"`.quiet();

      const status = await getRepoStatus(repoPath);
      expect(status.modified).toBe(0);
      expect(status.staged).toBe(0);
      expect(status.untracked).toBe(0);
      expect(status.deleted).toBe(0);
    });

    test("detects modified files", async () => {
      const repoPath = join(tempDir, "modified-repo");
      await $`git init --initial-branch=main ${repoPath}`.quiet();
      await $`git -C ${repoPath} config user.email "test@test.com"`.quiet();
      await $`git -C ${repoPath} config user.name "Test"`.quiet();
      await writeFile(join(repoPath, "README.md"), "# Test");
      await $`git -C ${repoPath} add .`.quiet();
      await $`git -C ${repoPath} commit -m "Initial commit"`.quiet();

      // Modify the file
      await writeFile(join(repoPath, "README.md"), "# Modified");

      const status = await getRepoStatus(repoPath);
      expect(status.modified).toBe(1);
    });

    test("detects staged files", async () => {
      const repoPath = join(tempDir, "staged-repo");
      await $`git init --initial-branch=main ${repoPath}`.quiet();
      await $`git -C ${repoPath} config user.email "test@test.com"`.quiet();
      await $`git -C ${repoPath} config user.name "Test"`.quiet();
      await writeFile(join(repoPath, "README.md"), "# Test");
      await $`git -C ${repoPath} add .`.quiet();
      await $`git -C ${repoPath} commit -m "Initial commit"`.quiet();

      // Add a new file and stage it
      await writeFile(join(repoPath, "new-file.txt"), "new content");
      await $`git -C ${repoPath} add new-file.txt`.quiet();

      const status = await getRepoStatus(repoPath);
      expect(status.staged).toBe(1);
    });

    test("detects untracked files", async () => {
      const repoPath = join(tempDir, "untracked-repo");
      await $`git init --initial-branch=main ${repoPath}`.quiet();
      await $`git -C ${repoPath} config user.email "test@test.com"`.quiet();
      await $`git -C ${repoPath} config user.name "Test"`.quiet();
      await writeFile(join(repoPath, "README.md"), "# Test");
      await $`git -C ${repoPath} add .`.quiet();
      await $`git -C ${repoPath} commit -m "Initial commit"`.quiet();

      // Add an untracked file
      await writeFile(join(repoPath, "untracked.txt"), "untracked content");

      const status = await getRepoStatus(repoPath);
      expect(status.untracked).toBe(1);
    });

    test("detects deleted files", async () => {
      const repoPath = join(tempDir, "deleted-repo");
      await $`git init --initial-branch=main ${repoPath}`.quiet();
      await $`git -C ${repoPath} config user.email "test@test.com"`.quiet();
      await $`git -C ${repoPath} config user.name "Test"`.quiet();
      await writeFile(join(repoPath, "README.md"), "# Test");
      await writeFile(join(repoPath, "to-delete.txt"), "will be deleted");
      await $`git -C ${repoPath} add .`.quiet();
      await $`git -C ${repoPath} commit -m "Initial commit"`.quiet();

      // Delete the file
      await rm(join(repoPath, "to-delete.txt"));

      const status = await getRepoStatus(repoPath);
      expect(status.deleted).toBe(1);
    });
  });

  describe("checkoutBranch", () => {
    test("switches to existing branch", async () => {
      const repoPath = join(tempDir, "checkout-repo");
      await $`git init --initial-branch=main ${repoPath}`.quiet();
      await $`git -C ${repoPath} config user.email "test@test.com"`.quiet();
      await $`git -C ${repoPath} config user.name "Test"`.quiet();
      await writeFile(join(repoPath, "README.md"), "# Test");
      await $`git -C ${repoPath} add .`.quiet();
      await $`git -C ${repoPath} commit -m "Initial commit"`.quiet();
      await $`git -C ${repoPath} branch feature-branch`.quiet();

      const result = await checkoutBranch(repoPath, "feature-branch");

      expect(result.success).toBe(true);
      expect(result.message).toBe("switched");

      const currentBranch = await getCurrentBranch(repoPath);
      expect(currentBranch).toBe("feature-branch");
    });

    test("creates new branch with create option", async () => {
      const repoPath = join(tempDir, "create-branch-repo");
      await $`git init --initial-branch=main ${repoPath}`.quiet();
      await $`git -C ${repoPath} config user.email "test@test.com"`.quiet();
      await $`git -C ${repoPath} config user.name "Test"`.quiet();
      await writeFile(join(repoPath, "README.md"), "# Test");
      await $`git -C ${repoPath} add .`.quiet();
      await $`git -C ${repoPath} commit -m "Initial commit"`.quiet();

      const result = await checkoutBranch(repoPath, "new-feature", { create: true });

      expect(result.success).toBe(true);
      expect(result.message).toBe("created");

      const currentBranch = await getCurrentBranch(repoPath);
      expect(currentBranch).toBe("new-feature");
    });

    test("returns not found for non-existent branch", async () => {
      const repoPath = join(tempDir, "notfound-branch-repo");
      await $`git init --initial-branch=main ${repoPath}`.quiet();
      await $`git -C ${repoPath} config user.email "test@test.com"`.quiet();
      await $`git -C ${repoPath} config user.name "Test"`.quiet();
      await writeFile(join(repoPath, "README.md"), "# Test");
      await $`git -C ${repoPath} add .`.quiet();
      await $`git -C ${repoPath} commit -m "Initial commit"`.quiet();

      const result = await checkoutBranch(repoPath, "nonexistent");

      expect(result.success).toBe(false);
      expect(result.message).toBe("not found");
    });
  });

  describe("execInRepo", () => {
    test("executes command successfully", async () => {
      const repoPath = join(tempDir, "exec-repo");
      await $`git init --initial-branch=main ${repoPath}`.quiet();

      const result = await execInRepo(repoPath, "echo hello");

      expect(result.success).toBe(true);
      expect(result.output?.trim()).toBe("hello");
    });

    test("captures command output", async () => {
      const repoPath = join(tempDir, "exec-output-repo");
      await $`git init --initial-branch=main ${repoPath}`.quiet();

      const result = await execInRepo(repoPath, "pwd");

      expect(result.success).toBe(true);
      expect(result.output).toContain(repoPath);
    });

    test("handles failed commands", async () => {
      const repoPath = join(tempDir, "exec-fail-repo");
      await $`git init --initial-branch=main ${repoPath}`.quiet();

      const result = await execInRepo(repoPath, "exit 1");

      expect(result.success).toBe(false);
    });
  });

  describe("cleanRepo", () => {
    test("reverts modified files", async () => {
      const repoPath = join(tempDir, "clean-modified-repo");
      await $`git init --initial-branch=main ${repoPath}`.quiet();
      await $`git -C ${repoPath} config user.email "test@test.com"`.quiet();
      await $`git -C ${repoPath} config user.name "Test"`.quiet();
      await writeFile(join(repoPath, "README.md"), "# Original");
      await $`git -C ${repoPath} add .`.quiet();
      await $`git -C ${repoPath} commit -m "Initial commit"`.quiet();

      // Modify the file
      await writeFile(join(repoPath, "README.md"), "# Modified");

      // Verify it's modified
      let status = await getRepoStatus(repoPath);
      expect(status.modified).toBe(1);

      // Clean
      const result = await cleanRepo(repoPath, false);
      expect(result.success).toBe(true);

      // Verify it's clean
      status = await getRepoStatus(repoPath);
      expect(status.modified).toBe(0);

      // Verify content is reverted
      const content = await readFile(join(repoPath, "README.md"), "utf-8");
      expect(content).toBe("# Original");
    });

    test("removes untracked files with all flag", async () => {
      const repoPath = join(tempDir, "clean-untracked-repo");
      await $`git init --initial-branch=main ${repoPath}`.quiet();
      await $`git -C ${repoPath} config user.email "test@test.com"`.quiet();
      await $`git -C ${repoPath} config user.name "Test"`.quiet();
      await writeFile(join(repoPath, "README.md"), "# Test");
      await $`git -C ${repoPath} add .`.quiet();
      await $`git -C ${repoPath} commit -m "Initial commit"`.quiet();

      // Add untracked file
      await writeFile(join(repoPath, "untracked.txt"), "untracked");

      // Verify it's untracked
      let status = await getRepoStatus(repoPath);
      expect(status.untracked).toBe(1);

      // Clean with all flag
      const result = await cleanRepo(repoPath, true);
      expect(result.success).toBe(true);

      // Verify untracked files are removed
      status = await getRepoStatus(repoPath);
      expect(status.untracked).toBe(0);
    });
  });
});
