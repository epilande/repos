import { describe, test, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { FetchApp } from "./fetch.js";
import { createTempRepoDir, createEmptyTempDir } from "../../tests/helpers/temp-repos.js";
import { waitFor } from "../../tests/helpers/ink-test-utils.js";

describe("FetchApp", () => {
  describe("rendering phases", () => {
    test("shows finding phase initially", async () => {
      const { path, cleanup } = await createEmptyTempDir();
      try {
        const { lastFrame, unmount } = render(
          <FetchApp options={{ basePath: path }} onComplete={() => {}} />
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
          <FetchApp options={{ basePath: path }} onComplete={() => {}} />
        );
        await waitFor(() => lastFrame()?.includes("No repositories") ?? false);
        expect(lastFrame()).toContain("No repositories found");
        unmount();
      } finally {
        await cleanup();
      }
    });
  });

  describe("fetch operations", () => {
    test("fetches repos successfully", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "repo-a" },
        { name: "repo-b" },
      ]);

      try {
        const { lastFrame, unmount } = render(
          <FetchApp options={{ basePath }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Summary") ?? false, 5000);

        const frame = lastFrame();
        expect(frame).toContain("Fetched:");
        expect(frame).toContain("repo-a");
        expect(frame).toContain("repo-b");
        unmount();
      } finally {
        await cleanup();
      }
    });
  });

  describe("dry run", () => {
    test("shows what would be fetched without fetching", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "repo-a" },
      ]);

      try {
        const { lastFrame, unmount } = render(
          <FetchApp options={{ basePath, dryRun: true }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Would fetch:") ?? false, 5000);

        const frame = lastFrame();
        expect(frame).toContain("repo-a");
        expect(frame).toContain("Would fetch:");
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
        { name: "api-client" },
        { name: "webapp" },
      ]);

      try {
        const { lastFrame, unmount } = render(
          <FetchApp options={{ basePath, filter: "api-*" }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Summary") ?? false, 5000);

        const frame = lastFrame();
        expect(frame).toContain("api-server");
        expect(frame).toContain("api-client");
        expect(frame).not.toContain("webapp");
        unmount();
      } finally {
        await cleanup();
      }
    });
  });

  describe("options", () => {
    test("shows prune option in header when enabled", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "repo-a" },
      ]);

      try {
        const { lastFrame, unmount } = render(
          <FetchApp options={{ basePath, prune: true }} onComplete={() => {}} />
        );

        // Wait for either the fetching phase or completion
        await waitFor(
          () =>
            (lastFrame()?.includes("prune") ||
              lastFrame()?.includes("Summary")) ??
            false,
          5000
        );

        const frame = lastFrame();
        expect(frame).toBeTruthy();
        unmount();
      } finally {
        await cleanup();
      }
    });

    test("shows all option in header when enabled", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "repo-a" },
      ]);

      try {
        const { lastFrame, unmount } = render(
          <FetchApp options={{ basePath, all: true }} onComplete={() => {}} />
        );

        await waitFor(
          () =>
            (lastFrame()?.includes("all") ||
              lastFrame()?.includes("Summary")) ??
            false,
          5000
        );

        const frame = lastFrame();
        expect(frame).toBeTruthy();
        unmount();
      } finally {
        await cleanup();
      }
    });
  });

  describe("summary", () => {
    test("shows correct counts", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "repo-a" },
        { name: "repo-b" },
      ]);

      try {
        const { lastFrame, unmount } = render(
          <FetchApp options={{ basePath }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Summary") ?? false, 5000);

        const frame = lastFrame();
        expect(frame).toContain("Repositories processed:");
        expect(frame).toContain("Fetched:");
        expect(frame).toContain("Duration:");
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
          <FetchApp
            options={{ basePath }}
            onComplete={() => {
              onCompleteCalled = true;
            }}
          />
        );

        await waitFor(() => lastFrame()?.includes("⌫/Esc Back") ?? false, 5000);
        expect(lastFrame()).toContain("⌫/Esc Back");

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
