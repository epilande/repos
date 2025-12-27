import { describe, test, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { CleanupApp } from "./cleanup.js";
import { createTempRepoDir } from "../../tests/helpers/temp-repos.js";
import { waitFor } from "../../tests/helpers/ink-test-utils.js";
import { writeFile } from "fs/promises";
import { join } from "path";

describe("CleanupApp", () => {
  describe("rendering phases", () => {
    test("shows finding phase initially", async () => {
      const { lastFrame, unmount } = render(
        <CleanupApp options={{}} onComplete={() => {}} />
      );

      expect(lastFrame()).toContain("Finding repositories");
      unmount();
    });

    test("shows error when no repos found", async () => {
      const tempDir = `/tmp/empty-cleanup-${Date.now()}`;
      const { mkdir, rm } = await import("fs/promises");
      await mkdir(tempDir, { recursive: true });

      const originalCwd = process.cwd();
      process.chdir(tempDir);

      try {
        const { lastFrame, unmount } = render(
          <CleanupApp options={{}} onComplete={() => {}} />
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

  describe("clean repos", () => {
    test("shows all clean message when no dirty repos", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "clean-repo" },
      ]);

      const originalCwd = process.cwd();
      process.chdir(basePath);

      try {
        const { lastFrame, unmount } = render(
          <CleanupApp options={{}} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("All repositories are already clean") ?? false, 5000);
        expect(lastFrame()).toContain("All repositories are already clean");
        unmount();
      } finally {
        process.chdir(originalCwd);
        await cleanup();
      }
    });
  });

  describe("dirty repos", () => {
    test("shows confirmation for dirty repos", async () => {
      const { basePath, repos, cleanup } = await createTempRepoDir([
        { name: "dirty-repo" },
      ]);

      await writeFile(join(repos[0].path, "README.md"), "modified content");

      const originalCwd = process.cwd();
      process.chdir(basePath);

      try {
        const { lastFrame, unmount } = render(
          <CleanupApp options={{}} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("WARNING") ?? false, 5000);

        const frame = lastFrame();
        expect(frame).toContain("Destructive Operation");
        expect(frame).toContain("dirty-repo");
        unmount();
      } finally {
        process.chdir(originalCwd);
        await cleanup();
      }
    });

    test("dry run shows preview without cleaning", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "dirty-repo" },
      ]);

      await writeFile(join(basePath, "dirty-repo", "README.md"), "modified");

      const originalCwd = process.cwd();
      process.chdir(basePath);

      try {
        const { lastFrame, unmount } = render(
          <CleanupApp options={{ dryRun: true }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Dry Run") ?? false, 5000);

        const frame = lastFrame();
        expect(frame).toContain("Cleanup Preview");
        expect(frame).toContain("dirty-repo");
        expect(frame).toContain("Would clean");
        unmount();
      } finally {
        process.chdir(originalCwd);
        await cleanup();
      }
    });

    test("force option skips confirmation", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "dirty-repo" },
      ]);

      await writeFile(join(basePath, "dirty-repo", "README.md"), "modified");

      const originalCwd = process.cwd();
      process.chdir(basePath);

      try {
        const { lastFrame, unmount } = render(
          <CleanupApp options={{ force: true }} onComplete={() => {}} />
        );

        // Should skip confirmation and go to cleaning
        await waitFor(
          () =>
            (lastFrame()?.includes("Cleaning") ||
              lastFrame()?.includes("cleaned")) ??
            false,
          5000
        );

        const frame = lastFrame();
        expect(frame).toBeTruthy();
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
        { name: "webapp" },
      ]);

      for (const repo of repos) {
        await writeFile(join(repo.path, "README.md"), "modified");
      }

      const originalCwd = process.cwd();
      process.chdir(basePath);

      try {
        const { lastFrame, unmount } = render(
          <CleanupApp options={{ filter: "api-*", dryRun: true }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Dry Run") ?? false, 5000);

        const frame = lastFrame();
        expect(frame).toContain("api-server");
        expect(frame).not.toContain("webapp");
        unmount();
      } finally {
        process.chdir(originalCwd);
        await cleanup();
      }
    });
  });
});
