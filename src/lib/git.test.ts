import { describe, test, expect } from "bun:test";
import { createTempRepo } from "../../tests/helpers/temp-repos.js";
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

function tempClonePath(label: string): string {
  return join(tmpdir(), `repos-test-${label}-${randomUUID().slice(0, 8)}`);
}
import {
  isGitRepo,
  getCurrentBranch,
  getRepoStatus,
  pullRepo,
  cleanRepo,
  fetchRepo,
  diffRepo,
  checkoutBranch,
  execInRepo,
} from "./git.js";

describe("git.ts", () => {
  describe("isGitRepo", () => {
    test("returns true for a valid git repository", async () => {
      const repo = await createTempRepo();
      try {
        const result = await isGitRepo(repo.path);
        expect(result).toBe(true);
      } finally {
        await repo.cleanup();
      }
    });

    test("returns false for a non-git directory", async () => {
      const tempDir = join("/tmp", `non-git-${Date.now()}`);
      await mkdir(tempDir, { recursive: true });
      try {
        const result = await isGitRepo(tempDir);
        expect(result).toBe(false);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });

    test("returns false for a non-existent path", async () => {
      const result = await isGitRepo("/non/existent/path");
      expect(result).toBe(false);
    });
  });

  describe("getCurrentBranch", () => {
    test("returns the current branch name", async () => {
      const repo = await createTempRepo({ branch: "main" });
      try {
        const branch = await getCurrentBranch(repo.path);
        expect(branch).toBe("main");
      } finally {
        await repo.cleanup();
      }
    });

    test("returns 'detached' for detached HEAD state", async () => {
      const repo = await createTempRepo();
      try {
        // Checkout a commit directly to get detached HEAD
        const { $ } = await import("bun");
        const result = await $`git -C ${repo.path} rev-parse HEAD`.quiet();
        const commitHash = result.text().trim();
        await $`git -C ${repo.path} checkout ${commitHash}`.quiet();

        const branch = await getCurrentBranch(repo.path);
        expect(branch).toBe("detached");
      } finally {
        await repo.cleanup();
      }
    });
  });

  describe("getRepoStatus", () => {
    test("returns clean status for a clean repo", async () => {
      const repo = await createTempRepo();
      try {
        const status = await getRepoStatus(repo.path);

        expect(status.name).toBe(repo.name);
        expect(status.branch).toBe("main");
        expect(status.modified).toBe(0);
        expect(status.staged).toBe(0);
        expect(status.untracked).toBe(0);
        expect(status.deleted).toBe(0);
        expect(status.isClean).toBe(true);
      } finally {
        await repo.cleanup();
      }
    });

    test("detects modified files", async () => {
      const repo = await createTempRepo();
      try {
        // Modify an existing file
        await writeFile(join(repo.path, "README.md"), "Modified content");

        const status = await getRepoStatus(repo.path);
        expect(status.modified).toBe(1);
        expect(status.isClean).toBe(false);
      } finally {
        await repo.cleanup();
      }
    });

    test("detects staged files", async () => {
      const repo = await createTempRepo({ staged: true });
      try {
        const status = await getRepoStatus(repo.path);
        expect(status.staged).toBeGreaterThan(0);
        expect(status.isClean).toBe(false);
      } finally {
        await repo.cleanup();
      }
    });

    test("detects untracked files", async () => {
      const repo = await createTempRepo({ dirty: true });
      try {
        const status = await getRepoStatus(repo.path);
        expect(status.untracked).toBe(1);
        expect(status.isClean).toBe(false);
      } finally {
        await repo.cleanup();
      }
    });
  });

  describe("pullRepo", () => {
    test("skips repos with no upstream configured", async () => {
      const repo = await createTempRepo();
      try {
        const result = await pullRepo(repo.path);
        expect(result.success).toBe(false);
        expect(result.message).toBe("skipped");
        expect(result.error).toContain("No upstream");
      } finally {
        await repo.cleanup();
      }
    });

    test("fast-forwards a clean repo that is behind", async () => {
      const { $ } = await import("bun");
      const origin = await createTempRepo({ name: `origin-${Date.now()}` });
      const clonePath = tempClonePath("clone-ff");
      try {
        await $`git clone ${origin.path} ${clonePath}`.quiet();
        await writeFile(join(origin.path, "added.txt"), "from origin");
        await $`git -C ${origin.path} add -A`.quiet();
        await $`git -C ${origin.path} commit -m "added"`.quiet();

        const result = await pullRepo(clonePath);
        expect(result.success).toBe(true);
        expect(result.message).toBe("updated");
      } finally {
        await rm(clonePath, { recursive: true, force: true });
        await origin.cleanup();
      }
    });

    test("fast-forwards a dirty repo when files do not overlap", async () => {
      const { $ } = await import("bun");
      const origin = await createTempRepo({ name: `origin-${Date.now()}` });
      const clonePath = tempClonePath("clone-dirty-ff");
      try {
        await $`git clone ${origin.path} ${clonePath}`.quiet();
        await writeFile(join(origin.path, "from-origin.txt"), "from origin");
        await $`git -C ${origin.path} add -A`.quiet();
        await $`git -C ${origin.path} commit -m "from origin"`.quiet();

        // Local change to a different file - no overlap with incoming commit
        await writeFile(join(clonePath, "local-only.txt"), "local work");

        const result = await pullRepo(clonePath);
        expect(result.success).toBe(true);
        expect(result.message).toBe("updated");
      } finally {
        await rm(clonePath, { recursive: true, force: true });
        await origin.cleanup();
      }
    });

    test("errors when dirty file overlaps incoming change", async () => {
      const { $ } = await import("bun");
      const origin = await createTempRepo({ name: `origin-${Date.now()}` });
      const clonePath = tempClonePath("clone-dirty-overlap");
      try {
        await $`git clone ${origin.path} ${clonePath}`.quiet();

        // Origin commits a change to README.md (which exists from initial commit)
        await writeFile(join(origin.path, "README.md"), "origin version");
        await $`git -C ${origin.path} add -A`.quiet();
        await $`git -C ${origin.path} commit -m "origin changes README"`.quiet();

        // Local uncommitted change to the same tracked file
        await writeFile(join(clonePath, "README.md"), "local uncommitted");

        const result = await pullRepo(clonePath);
        expect(result.success).toBe(false);
        expect(result.message).toBe("error");
        expect(result.error).toMatch(/would be overwritten|Aborting/);
      } finally {
        await rm(clonePath, { recursive: true, force: true });
        await origin.cleanup();
      }
    });

    test("returns up-to-date when already in sync", async () => {
      const { $ } = await import("bun");
      const origin = await createTempRepo({ name: `origin-${Date.now()}` });
      const clonePath = tempClonePath("clone-up-to-date");
      try {
        await $`git clone ${origin.path} ${clonePath}`.quiet();

        const result = await pullRepo(clonePath);
        expect(result.success).toBe(true);
        expect(result.message).toBe("up-to-date");
      } finally {
        await rm(clonePath, { recursive: true, force: true });
        await origin.cleanup();
      }
    });

    test("errors out on diverged history (not fast-forwardable)", async () => {
      const { $ } = await import("bun");
      const origin = await createTempRepo({ name: `origin-${Date.now()}` });
      const clonePath = tempClonePath("clone-diverged");
      try {
        await $`git clone ${origin.path} ${clonePath}`.quiet();

        // Add a commit to origin
        await writeFile(join(origin.path, "from-origin.txt"), "origin commit");
        await $`git -C ${origin.path} add -A`.quiet();
        await $`git -C ${origin.path} commit -m "origin commit"`.quiet();

        // Add a divergent commit to clone
        await writeFile(join(clonePath, "from-clone.txt"), "clone commit");
        await $`git -C ${clonePath} add -A`.quiet();
        await $`git -C ${clonePath} commit -m "clone commit"`.quiet();

        const result = await pullRepo(clonePath);
        expect(result.success).toBe(false);
        expect(result.message).toBe("error");
        expect(result.error).toBeTruthy();
      } finally {
        await rm(clonePath, { recursive: true, force: true });
        await origin.cleanup();
      }
    });
  });

  describe("cleanRepo", () => {
    test("reports already clean for clean repos", async () => {
      const repo = await createTempRepo();
      try {
        const result = await cleanRepo(repo.path);
        expect(result.success).toBe(true);
        expect(result.message).toBe("already clean");
      } finally {
        await repo.cleanup();
      }
    });

    test("reverts modified files", async () => {
      const repo = await createTempRepo();
      try {
        // Modify an existing file
        await writeFile(join(repo.path, "README.md"), "Modified content");

        const result = await cleanRepo(repo.path);
        expect(result.success).toBe(true);
        expect(result.message).toBe("cleaned");

        // Verify file was reverted
        const status = await getRepoStatus(repo.path);
        expect(status.isClean).toBe(true);
      } finally {
        await repo.cleanup();
      }
    });

    test("removes untracked files when includeUntracked is true", async () => {
      const repo = await createTempRepo({ dirty: true });
      try {
        const result = await cleanRepo(repo.path, true);
        expect(result.success).toBe(true);
        expect(result.message).toBe("cleaned");

        // Verify untracked files were removed
        const status = await getRepoStatus(repo.path);
        expect(status.untracked).toBe(0);
      } finally {
        await repo.cleanup();
      }
    });
  });

  describe("fetchRepo", () => {
    test("successfully fetches a repo (no-op for local)", async () => {
      const repo = await createTempRepo();
      try {
        // Fetching a local-only repo should still work (no-op)
        const result = await fetchRepo(repo.path);
        expect(result.success).toBe(true);
        expect(result.message).toBe("fetched");
      } finally {
        await repo.cleanup();
      }
    });

    test("handles prune option", async () => {
      const repo = await createTempRepo();
      try {
        const result = await fetchRepo(repo.path, { prune: true });
        expect(result.success).toBe(true);
        expect(result.message).toBe("fetched");
      } finally {
        await repo.cleanup();
      }
    });
  });

  describe("diffRepo", () => {
    test("returns no diff for a clean repo", async () => {
      const repo = await createTempRepo();
      try {
        const result = await diffRepo(repo.path);
        expect(result.hasDiff).toBe(false);
        expect(result.diff).toBe("");
        expect(result.stat).toBe("");
      } finally {
        await repo.cleanup();
      }
    });

    test("returns diff for modified files", async () => {
      const repo = await createTempRepo();
      try {
        // Modify an existing file
        await writeFile(join(repo.path, "README.md"), "Modified content");

        const result = await diffRepo(repo.path);
        expect(result.hasDiff).toBe(true);
        expect(result.diff).toContain("Modified content");
        expect(result.stat).not.toBe("");
      } finally {
        await repo.cleanup();
      }
    });
  });

  describe("checkoutBranch", () => {
    test("switches to an existing branch", async () => {
      const repo = await createTempRepo();
      try {
        // Create a new branch first
        const { $ } = await import("bun");
        await $`git -C ${repo.path} branch feature-branch`.quiet();

        const result = await checkoutBranch(repo.path, "feature-branch");
        expect(result.success).toBe(true);
        expect(result.message).toBe("switched");

        const currentBranch = await getCurrentBranch(repo.path);
        expect(currentBranch).toBe("feature-branch");
      } finally {
        await repo.cleanup();
      }
    });

    test("creates a new branch when create option is true", async () => {
      const repo = await createTempRepo();
      try {
        const result = await checkoutBranch(repo.path, "new-branch", {
          create: true,
        });
        expect(result.success).toBe(true);
        expect(result.message).toBe("created");

        const currentBranch = await getCurrentBranch(repo.path);
        expect(currentBranch).toBe("new-branch");
      } finally {
        await repo.cleanup();
      }
    });

    test("returns not found for non-existent branch", async () => {
      const repo = await createTempRepo();
      try {
        const result = await checkoutBranch(repo.path, "non-existent-branch");
        expect(result.success).toBe(false);
        expect(result.message).toBe("not found");
      } finally {
        await repo.cleanup();
      }
    });

    test("returns exists error when creating existing branch", async () => {
      const repo = await createTempRepo();
      try {
        const result = await checkoutBranch(repo.path, "main", {
          create: true,
        });
        expect(result.success).toBe(false);
        expect(result.message).toBe("exists");
      } finally {
        await repo.cleanup();
      }
    });
  });

  describe("execInRepo", () => {
    test("executes command successfully", async () => {
      const repo = await createTempRepo();
      try {
        const result = await execInRepo(repo.path, "echo hello");
        expect(result.success).toBe(true);
        expect(result.exitCode).toBe(0);
        expect(result.output).toBe("hello");
      } finally {
        await repo.cleanup();
      }
    });

    test("returns correct exit code for failed commands", async () => {
      const repo = await createTempRepo();
      try {
        const result = await execInRepo(repo.path, "exit 1");
        expect(result.success).toBe(false);
        expect(result.exitCode).toBe(1);
      } finally {
        await repo.cleanup();
      }
    });

    test("executes command in the repo directory", async () => {
      const repo = await createTempRepo();
      try {
        const result = await execInRepo(repo.path, "pwd");
        expect(result.success).toBe(true);
        expect(result.output).toContain(repo.name);
      } finally {
        await repo.cleanup();
      }
    });

    test("captures stderr for failed commands", async () => {
      const repo = await createTempRepo();
      try {
        const result = await execInRepo(repo.path, "echo error >&2 && exit 1");
        expect(result.success).toBe(false);
        expect(result.error).toContain("error");
      } finally {
        await repo.cleanup();
      }
    });
  });
});
