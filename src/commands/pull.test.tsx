import { describe, test, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { PullApp } from "./pull.js";
import { createTempRepoDir, createEmptyTempDir } from "../../tests/helpers/temp-repos.js";
import { waitFor } from "../../tests/helpers/ink-test-utils.js";

describe("PullApp", () => {
  describe("rendering phases", () => {
    test("shows finding phase initially", async () => {
      const { path, cleanup } = await createEmptyTempDir();
      try {
        const { lastFrame, unmount } = render(
          <PullApp options={{ basePath: path }} onComplete={() => {}} />
        );
        expect(lastFrame()).toContain("Finding repositories");
        unmount();
      } finally {
        await cleanup();
      }
    });

    test("shows error when no repos found", async () => {
      const { path, cleanup } = await createEmptyTempDir();
      try {
        const { lastFrame, unmount } = render(
          <PullApp options={{ basePath: path }} onComplete={() => {}} />
        );
        await waitFor(() => lastFrame()?.includes("No repositories") ?? false);
        expect(lastFrame()).toContain("No repositories found");
        unmount();
      } finally {
        await cleanup();
      }
    });
  });

  describe("update operations", () => {
    test("shows up-to-date for repos without remote changes", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "repo-a" },
      ]);

      try {
        const { lastFrame, unmount } = render(
          <PullApp options={{ basePath }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Summary") ?? false, 10000);

        const frame = lastFrame();
        expect(frame).toContain("Repositories processed:");
        unmount();
      } finally {
        await cleanup();
      }
    });

    test("dry run shows what would be updated", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "repo-a" },
      ]);

      try {
        const { lastFrame, unmount } = render(
          <PullApp options={{ dryRun: true, basePath }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Update Check") ?? false, 10000);

        const frame = lastFrame();
        expect(frame).toContain("Dry Run");
        unmount();
      } finally {
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

      try {
        const { lastFrame, unmount } = render(
          <PullApp options={{ filter: "api-*", basePath }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Summary") ?? false, 10000);

        const frame = lastFrame();
        expect(frame).toContain("api-server");
        unmount();
      } finally {
        await cleanup();
      }
    });
  });

  describe("interactive mode", () => {
    test("shows escape hint and handles escape key", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "repo-a" },
      ]);

      let onCompleteCalled = false;

      try {
        const { lastFrame, stdin, unmount } = render(
          <PullApp
            options={{ basePath }}
            onComplete={() => {
              onCompleteCalled = true;
            }}
          />
        );

        await waitFor(() => lastFrame()?.includes("Press Escape") ?? false, 10000);
        expect(lastFrame()).toContain("Press Escape");

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
        await cleanup();
      }
    });
  });
});
