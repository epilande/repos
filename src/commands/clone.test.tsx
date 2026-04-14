import { describe, test, expect, spyOn, beforeEach } from "bun:test";
import { render } from "ink-testing-library";
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { $ } from "bun";
import { waitFor } from "../../tests/helpers/ink-test-utils.js";
import * as github from "../lib/github.js";

async function createBareRepo(
  parentDir: string,
  name: string,
): Promise<string> {
  const barePath = join(parentDir, `${name}.git`);
  await mkdir(barePath, { recursive: true });
  await $`git init --bare ${barePath}`.quiet();

  const workPath = join(parentDir, `${name}-work`);
  await mkdir(workPath, { recursive: true });
  await $`git init ${workPath}`.quiet();
  await $`git -C ${workPath} config user.email "test@test.com"`.quiet();
  await $`git -C ${workPath} config user.name "Test"`.quiet();
  await writeFile(join(workPath, "README.md"), `# ${name}`);
  await $`git -C ${workPath} add -A`.quiet();
  await $`git -C ${workPath} commit -m "init"`.quiet();
  await $`git -C ${workPath} remote add origin ${barePath}`.quiet();
  await $`git -C ${workPath} push origin HEAD`.quiet().nothrow();
  await rm(workPath, { recursive: true, force: true });

  return barePath;
}

function makeGitHubRepo(name: string, cloneUrl: string) {
  return {
    name,
    fullName: `test-org/${name}`,
    cloneUrl,
    sshUrl: cloneUrl,
    pushedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archived: false,
  };
}

async function setupBareRepos(bareDir: string, names: string[]) {
  const barePaths = await Promise.all(
    names.map((name) => createBareRepo(bareDir, name)),
  );
  const fakeRepos = names.map((name, i) => makeGitHubRepo(name, barePaths[i]));
  return { barePaths, fakeRepos };
}

describe("CloneApp", () => {
  let tempDir: string;
  let workDir: string;
  let bareDir: string;
  let listReposSpy: ReturnType<typeof spyOn>;
  let getGitHubConfigSpy: ReturnType<typeof spyOn>;
  const originalCwd = process.cwd();

  // Dynamic import needed: spies on github module must be set before CloneApp evaluates
  const loadCloneApp = () => import("./clone.js");

  beforeEach(async () => {
    tempDir = join(tmpdir(), `repos-clone-test-${randomUUID().slice(0, 8)}`);
    workDir = join(tempDir, "work");
    bareDir = join(tempDir, "bare");
    await mkdir(workDir, { recursive: true });
    await mkdir(bareDir, { recursive: true });
    process.chdir(workDir);

    listReposSpy = spyOn(github, "listRepos").mockResolvedValue([]);
    getGitHubConfigSpy = spyOn(github, "getGitHubConfig").mockResolvedValue({
      host: "github.com",
      apiUrl: "https://api.github.com",
    });
  });

  async function cleanup() {
    process.chdir(originalCwd);
    listReposSpy.mockRestore();
    getGitHubConfigSpy.mockRestore();
    await rm(tempDir, { recursive: true, force: true });
  }

  test("clones repos without duplicate 'already exists' errors", async () => {
    // More than default concurrency of 10 to stress the race window
    const repoNames = Array.from(
      { length: 15 },
      (_, i) => `repo-${String(i + 1).padStart(2, "0")}`,
    );
    const { fakeRepos } = await setupBareRepos(bareDir, repoNames);
    listReposSpy.mockResolvedValue(fakeRepos);

    const { CloneApp } = await loadCloneApp();

    try {
      const { lastFrame, unmount } = render(
        <CloneApp
          options={{ org: "test-org", parallel: 10 }}
          onComplete={() => {}}
        />,
      );

      await waitFor(() => lastFrame()?.includes("Summary") ?? false, 30000);

      const frame = lastFrame()!;
      expect(frame).not.toContain("Failed:");
      expect(frame).toContain(`Cloned: ${repoNames.length}`);
      unmount();
    } finally {
      await cleanup();
    }
  }, 60000);

  test("shows error when no org specified", async () => {
    const { CloneApp } = await loadCloneApp();

    try {
      const { lastFrame, unmount } = render(
        <CloneApp options={{}} onComplete={() => {}} />,
      );

      await waitFor(
        () => lastFrame()?.includes("No organization") ?? false,
        10000,
      );

      expect(lastFrame()).toContain("No organization specified");
      unmount();
    } finally {
      await cleanup();
    }
  });

  test("dry run shows preview without cloning", async () => {
    const { fakeRepos } = await setupBareRepos(bareDir, ["dry-repo"]);
    listReposSpy.mockResolvedValue(fakeRepos);

    const { CloneApp } = await loadCloneApp();

    try {
      const { lastFrame, unmount } = render(
        <CloneApp
          options={{ org: "test-org", dryRun: true }}
          onComplete={() => {}}
        />,
      );

      await waitFor(() => lastFrame()?.includes("Dry Run") ?? false, 10000);

      const frame = lastFrame()!;
      expect(frame).toContain("would clone");
      expect(frame).toContain("Dry run complete");
      unmount();
    } finally {
      await cleanup();
    }
  });

  test("dry-run-to-live-run transition clones after confirmation", async () => {
    const repoNames = ["confirm-repo-1", "confirm-repo-2", "confirm-repo-3"];
    const { fakeRepos } = await setupBareRepos(bareDir, repoNames);
    listReposSpy.mockResolvedValue(fakeRepos);

    const { CloneApp } = await loadCloneApp();

    try {
      const { lastFrame, stdin, unmount } = render(
        <CloneApp
          options={{ org: "test-org", dryRun: true, interactive: true }}
          onComplete={() => {}}
        />,
      );

      await waitFor(
        () => lastFrame()?.includes("Would you like to proceed") ?? false,
        10000,
      );

      const previewFrame = lastFrame()!;
      expect(previewFrame).toContain("would clone");

      // Confirm defaults to "Yes", press Enter to proceed
      await new Promise((r) => setTimeout(r, 50));
      stdin.write("\r");

      await waitFor(() => lastFrame()?.includes("Summary") ?? false, 30000);

      const frame = lastFrame()!;
      expect(frame).not.toContain("Failed:");
      expect(frame).toContain(`Cloned: ${repoNames.length}`);
      unmount();
    } finally {
      await cleanup();
    }
  }, 60000);

  test("cancellation via escape stops cloning", async () => {
    const repoNames = Array.from(
      { length: 10 },
      (_, i) => `cancel-repo-${String(i + 1).padStart(2, "0")}`,
    );
    const { fakeRepos } = await setupBareRepos(bareDir, repoNames);
    listReposSpy.mockResolvedValue(fakeRepos);

    const { CloneApp } = await loadCloneApp();

    try {
      const { lastFrame, stdin, unmount } = render(
        <CloneApp
          options={{ org: "test-org", parallel: 1 }}
          onComplete={() => {}}
        />,
      );

      await waitFor(() => lastFrame()?.includes("Progress") ?? false, 10000);

      stdin.write("\x1B"); // Escape

      await waitFor(
        () =>
          (lastFrame()?.includes("Cancelled") ||
            lastFrame()?.includes("Summary")) ??
          false,
        15000,
      );

      const frame = lastFrame()!;
      expect(frame).not.toContain("already exists");
      unmount();
    } finally {
      await cleanup();
    }
  }, 60000);

  test("escape key calls onComplete when done", async () => {
    const { fakeRepos } = await setupBareRepos(bareDir, ["esc-repo"]);
    listReposSpy.mockResolvedValue(fakeRepos);

    const { CloneApp } = await loadCloneApp();

    let onCompleteCalled = false;

    try {
      const { lastFrame, stdin, unmount } = render(
        <CloneApp
          options={{ org: "test-org" }}
          onComplete={() => {
            onCompleteCalled = true;
          }}
        />,
      );

      await waitFor(() => lastFrame()?.includes("⌫/Esc Back") ?? false, 15000);

      await new Promise((r) => setTimeout(r, 50));

      for (let attempt = 0; attempt < 5 && !onCompleteCalled; attempt++) {
        stdin.write("\x1B");
        await new Promise((r) => setTimeout(r, 100));
      }

      expect(onCompleteCalled).toBe(true);
      unmount();
    } finally {
      await cleanup();
    }
  });

  test("pulls existing repos instead of cloning", async () => {
    const { fakeRepos, barePaths } = await setupBareRepos(bareDir, [
      "existing-repo",
    ]);
    await $`git clone ${barePaths[0]} ${join(workDir, "existing-repo")}`.quiet();
    listReposSpy.mockResolvedValue(fakeRepos);

    const { CloneApp } = await loadCloneApp();

    try {
      const { lastFrame, unmount } = render(
        <CloneApp options={{ org: "test-org" }} onComplete={() => {}} />,
      );

      await waitFor(() => lastFrame()?.includes("Summary") ?? false, 15000);

      const frame = lastFrame()!;
      expect(frame).not.toContain("Failed:");
      expect(frame).toContain("Pulled: 1");
      unmount();
    } finally {
      await cleanup();
    }
  });
});
