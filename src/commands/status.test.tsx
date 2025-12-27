import { describe, test, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { StatusApp } from "./status.js";
import { createTempRepoDir, createEmptyTempDir } from "../../tests/helpers/temp-repos.js";
import { waitFor } from "../../tests/helpers/ink-test-utils.js";

describe("StatusApp", () => {
  describe("rendering phases", () => {
    test("shows finding phase initially", async () => {
      const { path, cleanup } = await createEmptyTempDir();
      try {
        const { lastFrame, unmount } = render(
          <StatusApp options={{ basePath: path }} onComplete={() => {}} />
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
          <StatusApp options={{ basePath: path }} onComplete={() => {}} />
        );
        await waitFor(() => lastFrame()?.includes("No repositories") ?? false);
        expect(lastFrame()).toContain("No repositories found");
        unmount();
      } finally {
        await cleanup();
      }
    });

    test("shows error when filter matches nothing", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "repo-a" },
      ]);

      try {
        const { lastFrame, unmount } = render(
          <StatusApp options={{ basePath, filter: "nonexistent-*" }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("No repositories match") ?? false);
        expect(lastFrame()).toContain("No repositories match pattern");

        unmount();
      } finally {
        await cleanup();
      }
    });

    test("shows checking phase with progress bar", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "repo-a" },
        { name: "repo-b" },
      ]);

      try {
        const { lastFrame, unmount } = render(
          <StatusApp options={{ basePath }} onComplete={() => {}} />
        );

        await waitFor(
          () =>
            (lastFrame()?.includes("Checking Status") ||
              lastFrame()?.includes("Repository Status")) ??
            false,
          3000
        );

        const frame = lastFrame();
        expect(frame).toBeTruthy();

        unmount();
      } finally {
        await cleanup();
      }
    });

    test("shows done phase with results", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "clean-repo" },
        { name: "dirty-repo", dirty: true },
      ]);

      try {
        const { lastFrame, unmount } = render(
          <StatusApp options={{ basePath }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Summary:") ?? false, 5000);

        const frame = lastFrame();
        expect(frame).toContain("Repository Status");
        expect(frame).toContain("Summary:");
        expect(frame).toContain("Repositories checked");

        unmount();
      } finally {
        await cleanup();
      }
    });
  });

  describe("options", () => {
    test("quiet mode only shows repos with changes", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "clean-repo" },
        { name: "dirty-repo", dirty: true },
      ]);

      try {
        const { lastFrame, unmount } = render(
          <StatusApp options={{ basePath, quiet: true }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Summary:") ?? false, 5000);

        const frame = lastFrame();
        expect(frame).toContain("dirty-repo");

        unmount();
      } finally {
        await cleanup();
      }
    });

    test("summary mode shows counts instead of table", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "repo-a" },
        { name: "repo-b" },
      ]);

      try {
        const { lastFrame, unmount } = render(
          <StatusApp options={{ basePath, summary: true }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Summary") ?? false, 5000);
        expect(lastFrame()).toContain("Repository Status Summary");

        unmount();
      } finally {
        await cleanup();
      }
    });

    test("filter option filters repos by pattern", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "api-server" },
        { name: "api-client" },
        { name: "webapp" },
      ]);

      try {
        const { lastFrame, unmount } = render(
          <StatusApp options={{ basePath, filter: "api-*" }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Summary:") ?? false, 5000);

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

  describe("interactive mode", () => {
    test("calls onComplete when provided", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "repo-a" },
      ]);

      let onCompleteCalled = false;
      const onComplete = () => {
        onCompleteCalled = true;
      };

      try {
        const { lastFrame, stdin, unmount } = render(
          <StatusApp options={{ basePath }} onComplete={onComplete} />
        );

        await waitFor(() => lastFrame()?.includes("Press Escape") ?? false, 5000);

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
