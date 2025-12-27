import { describe, test, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { UpdateApp } from "./update.js";
import { createTempRepoDir } from "../../tests/helpers/temp-repos.js";
import { waitFor } from "../../tests/helpers/ink-test-utils.js";

describe("UpdateApp", () => {
  describe("rendering phases", () => {
    test("shows finding phase initially", async () => {
      const { lastFrame, unmount } = render(
        <UpdateApp options={{}} onComplete={() => {}} />
      );

      expect(lastFrame()).toContain("Finding repositories");
      unmount();
    });

    test("shows error when no repos found", async () => {
      const tempDir = `/tmp/empty-update-${Date.now()}`;
      const { mkdir, rm } = await import("fs/promises");
      await mkdir(tempDir, { recursive: true });

      const originalCwd = process.cwd();
      process.chdir(tempDir);

      try {
        const { lastFrame, unmount } = render(
          <UpdateApp options={{}} onComplete={() => {}} />
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

  describe("update operations", () => {
    test("shows up-to-date for repos without remote changes", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "repo-a" },
      ]);

      const originalCwd = process.cwd();
      process.chdir(basePath);

      try {
        const { lastFrame, unmount } = render(
          <UpdateApp options={{}} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Summary") ?? false, 10000);

        const frame = lastFrame();
        expect(frame).toContain("Repositories processed:");
        unmount();
      } finally {
        process.chdir(originalCwd);
        await cleanup();
      }
    });

    test("dry run shows what would be updated", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "repo-a" },
      ]);

      const originalCwd = process.cwd();
      process.chdir(basePath);

      try {
        const { lastFrame, unmount } = render(
          <UpdateApp options={{ dryRun: true }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Update Check") ?? false, 10000);

        const frame = lastFrame();
        expect(frame).toContain("Dry Run");
        unmount();
      } finally {
        process.chdir(originalCwd);
        await cleanup();
      }
    });
  });

  describe("filter option", () => {
    test("filters repos by pattern", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "api-server" },
        { name: "webapp" },
      ]);

      const originalCwd = process.cwd();
      process.chdir(basePath);

      try {
        const { lastFrame, unmount } = render(
          <UpdateApp options={{ filter: "api-*" }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Summary") ?? false, 10000);

        const frame = lastFrame();
        expect(frame).toContain("api-server");
        unmount();
      } finally {
        process.chdir(originalCwd);
        await cleanup();
      }
    });
  });

  describe("interactive mode", () => {
    test("shows escape hint and handles escape key", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "repo-a" },
      ]);

      const originalCwd = process.cwd();
      process.chdir(basePath);

      let onCompleteCalled = false;

      try {
        const { lastFrame, stdin, unmount } = render(
          <UpdateApp
            options={{}}
            onComplete={() => {
              onCompleteCalled = true;
            }}
          />
        );

        await waitFor(() => lastFrame()?.includes("Press Escape") ?? false, 10000);
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
