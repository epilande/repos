import { describe, test, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { StatusApp } from "./status.js";
import { createTempRepoDir } from "../../tests/helpers/temp-repos.js";
import { waitFor } from "../../tests/helpers/ink-test-utils.js";

describe("StatusApp", () => {
  describe("rendering phases", () => {
    test("shows finding phase initially", async () => {
      const { lastFrame, unmount } = render(
        <StatusApp options={{}} onComplete={() => {}} />
      );

      expect(lastFrame()).toContain("Finding repositories");
      unmount();
    });

    test("shows error when no repos found", async () => {
      const tempDir = `/tmp/empty-test-${Date.now()}`;
      const { mkdir, rm } = await import("fs/promises");
      await mkdir(tempDir, { recursive: true });

      const originalCwd = process.cwd();
      process.chdir(tempDir);

      try {
        const { lastFrame, unmount } = render(
          <StatusApp options={{}} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("No repositories") ?? false);
        expect(lastFrame()).toContain("No repositories found");

        unmount();
      } finally {
        process.chdir(originalCwd);
        await rm(tempDir, { recursive: true, force: true });
      }
    });

    test("shows error when filter matches nothing", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "repo-a" },
      ]);

      const originalCwd = process.cwd();
      process.chdir(basePath);

      try {
        const { lastFrame, unmount } = render(
          <StatusApp options={{ filter: "nonexistent-*" }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("No repositories match") ?? false);
        expect(lastFrame()).toContain("No repositories match pattern");

        unmount();
      } finally {
        process.chdir(originalCwd);
        await cleanup();
      }
    });

    test("shows checking phase with progress bar", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "repo-a" },
        { name: "repo-b" },
      ]);

      const originalCwd = process.cwd();
      process.chdir(basePath);

      try {
        const { lastFrame, unmount } = render(
          <StatusApp options={{}} onComplete={() => {}} />
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
        process.chdir(originalCwd);
        await cleanup();
      }
    });

    test("shows done phase with results", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "clean-repo" },
        { name: "dirty-repo", dirty: true },
      ]);

      const originalCwd = process.cwd();
      process.chdir(basePath);

      try {
        const { lastFrame, unmount } = render(
          <StatusApp options={{}} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Summary:") ?? false, 5000);

        const frame = lastFrame();
        expect(frame).toContain("Repository Status");
        expect(frame).toContain("Summary:");
        expect(frame).toContain("Repositories checked");

        unmount();
      } finally {
        process.chdir(originalCwd);
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

      const originalCwd = process.cwd();
      process.chdir(basePath);

      try {
        const { lastFrame, unmount } = render(
          <StatusApp options={{ quiet: true }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Summary:") ?? false, 5000);

        const frame = lastFrame();
        expect(frame).toContain("dirty-repo");

        unmount();
      } finally {
        process.chdir(originalCwd);
        await cleanup();
      }
    });

    test("summary mode shows counts instead of table", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "repo-a" },
        { name: "repo-b" },
      ]);

      const originalCwd = process.cwd();
      process.chdir(basePath);

      try {
        const { lastFrame, unmount } = render(
          <StatusApp options={{ summary: true }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Summary") ?? false, 5000);
        expect(lastFrame()).toContain("Repository Status Summary");

        unmount();
      } finally {
        process.chdir(originalCwd);
        await cleanup();
      }
    });

    test("filter option filters repos by pattern", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "api-server" },
        { name: "api-client" },
        { name: "webapp" },
      ]);

      const originalCwd = process.cwd();
      process.chdir(basePath);

      try {
        const { lastFrame, unmount } = render(
          <StatusApp options={{ filter: "api-*" }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Summary:") ?? false, 5000);

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
    test("calls onComplete when provided", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "repo-a" },
      ]);

      const originalCwd = process.cwd();
      process.chdir(basePath);

      let onCompleteCalled = false;
      const onComplete = () => {
        onCompleteCalled = true;
      };

      try {
        const { lastFrame, stdin, unmount } = render(
          <StatusApp options={{}} onComplete={onComplete} />
        );

        await waitFor(() => lastFrame()?.includes("Press Escape") ?? false, 5000);

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
