import { describe, test, expect } from "bun:test";
import { $ } from "bun";
import React from "react";
import { render } from "ink-testing-library";
import { CheckoutApp } from "./checkout.js";
import { createTempRepoDir } from "../../tests/helpers/temp-repos.js";
import { waitFor } from "../../tests/helpers/ink-test-utils.js";

describe("CheckoutApp", () => {
  describe("rendering phases", () => {
    test("shows finding phase initially", async () => {
      const { lastFrame, unmount } = render(
        <CheckoutApp options={{ branch: "main" }} onComplete={() => {}} />
      );

      expect(lastFrame()).toContain("Finding repositories");
      unmount();
    });

    test("shows error when branch name is empty", async () => {
      const { lastFrame, unmount } = render(
        <CheckoutApp options={{ branch: "" }} onComplete={() => {}} />
      );

      await waitFor(() => lastFrame()?.includes("Branch name is required") ?? false);
      expect(lastFrame()).toContain("Branch name is required");
      unmount();
    });

    test("shows error when branch name is whitespace only", async () => {
      const { lastFrame, unmount } = render(
        <CheckoutApp options={{ branch: "   " }} onComplete={() => {}} />
      );

      await waitFor(() => lastFrame()?.includes("Branch name is required") ?? false);
      expect(lastFrame()).toContain("Branch name is required");
      unmount();
    });

    test("shows error when no repos found", async () => {
      const tempDir = `/tmp/empty-checkout-${Date.now()}`;
      const { mkdir, rm } = await import("fs/promises");
      await mkdir(tempDir, { recursive: true });

      const originalCwd = process.cwd();
      process.chdir(tempDir);

      try {
        const { lastFrame, unmount } = render(
          <CheckoutApp options={{ branch: "main" }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("No repositories") ?? false);
        expect(lastFrame()).toContain("No repositories found");
        unmount();
      } finally {
        process.chdir(originalCwd);
        await rm(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe("branch operations", () => {
    test("switches to existing branch", async () => {
      const { basePath, repos, cleanup } = await createTempRepoDir([
        { name: "repo-a" },
      ]);

      await $`git -C ${repos[0].path} branch feature-branch`.quiet();

      const originalCwd = process.cwd();
      process.chdir(basePath);

      try {
        const { lastFrame, unmount } = render(
          <CheckoutApp options={{ branch: "feature-branch" }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Summary") ?? false, 5000);

        const frame = lastFrame();
        expect(frame).toContain("Checkout Branch: feature-branch");
        expect(frame).toContain("switched");
        unmount();
      } finally {
        process.chdir(originalCwd);
        await cleanup();
      }
    });

    test("creates new branch with create option", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "repo-a" },
      ]);

      const originalCwd = process.cwd();
      process.chdir(basePath);

      try {
        const { lastFrame, unmount } = render(
          <CheckoutApp options={{ branch: "new-feature", create: true }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Summary") ?? false, 5000);

        const frame = lastFrame();
        expect(frame).toContain("created");
        unmount();
      } finally {
        process.chdir(originalCwd);
        await cleanup();
      }
    });

    test("shows not found for non-existent branch", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "repo-a" },
      ]);

      const originalCwd = process.cwd();
      process.chdir(basePath);

      try {
        const { lastFrame, unmount } = render(
          <CheckoutApp options={{ branch: "nonexistent-branch" }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Summary") ?? false, 5000);

        const frame = lastFrame();
        expect(frame).toContain("not found");
        unmount();
      } finally {
        process.chdir(originalCwd);
        await cleanup();
      }
    });

    test("skips repos with uncommitted changes", async () => {
      const { basePath, repos, cleanup } = await createTempRepoDir([
        { name: "dirty-repo", dirty: true },
      ]);

      const { writeFile } = await import("fs/promises");
      const { join } = await import("path");
      await writeFile(join(repos[0].path, "README.md"), "modified");
      await $`git -C ${repos[0].path} branch feature-branch`.quiet();

      const originalCwd = process.cwd();
      process.chdir(basePath);

      try {
        const { lastFrame, unmount } = render(
          <CheckoutApp options={{ branch: "feature-branch" }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Summary") ?? false, 5000);

        const frame = lastFrame();
        expect(frame).toContain("skipped");
        expect(frame).toContain("Skipped:");
        unmount();
      } finally {
        process.chdir(originalCwd);
        await cleanup();
      }
    });
  });

  describe("filter option", () => {
    test("filters repos by pattern", async () => {
      const { basePath, repos, cleanup } = await createTempRepoDir([
        { name: "api-server" },
        { name: "api-client" },
        { name: "webapp" },
      ]);

      for (const repo of repos) {
        await $`git -C ${repo.path} branch feature-branch`.quiet();
      }

      const originalCwd = process.cwd();
      process.chdir(basePath);

      try {
        const { lastFrame, unmount } = render(
          <CheckoutApp options={{ branch: "feature-branch", filter: "api-*" }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Summary") ?? false, 5000);

        const frame = lastFrame();
        expect(frame).toContain("api-server");
        expect(frame).toContain("api-client");
        expect(frame).not.toContain("webapp");
        unmount();
      } finally {
        process.chdir(originalCwd);
        await cleanup();
      }
    });
  });

  describe("interactive mode", () => {
    test("shows escape hint and handles escape key", async () => {
      const { basePath, repos, cleanup } = await createTempRepoDir([
        { name: "repo-a" },
      ]);

      await $`git -C ${repos[0].path} branch test-branch`.quiet();

      const originalCwd = process.cwd();
      process.chdir(basePath);

      let onCompleteCalled = false;

      try {
        const { lastFrame, stdin, unmount } = render(
          <CheckoutApp
            options={{ branch: "test-branch" }}
            onComplete={() => {
              onCompleteCalled = true;
            }}
          />
        );

        // Wait for completion first (Summary), then check for escape hint
        await waitFor(() => lastFrame()?.includes("Summary") ?? false, 5000);
        expect(lastFrame()).toContain("Press Escape to return");

        // Small delay to ensure useInput hook is fully registered
        await new Promise((r) => setTimeout(r, 50));

        // Send escape key and retry if needed (ink stdin can be unreliable)
        for (let attempt = 0; attempt < 5 && !onCompleteCalled; attempt++) {
          stdin.write("\x1B");
          await new Promise((r) => setTimeout(r, 100));
        }

        expect(onCompleteCalled).toBe(true);
        unmount();
      } finally {
        process.chdir(originalCwd);
        await cleanup();
      }
    });
  });
});
