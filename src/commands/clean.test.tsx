import { describe, test, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { CleanApp } from "./clean.js";
import { createTempRepoDir, createEmptyTempDir } from "../../tests/helpers/temp-repos.js";
import { waitFor } from "../../tests/helpers/ink-test-utils.js";
import { writeFile } from "fs/promises";
import { join } from "path";

describe("CleanApp", () => {
  describe("rendering phases", () => {
    test("shows finding phase initially", async () => {
      const { path, cleanup } = await createEmptyTempDir();
      try {
        const { lastFrame, unmount } = render(
          <CleanApp options={{ basePath: path }} onComplete={() => {}} />
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
          <CleanApp options={{ basePath: path }} onComplete={() => {}} />
        );
        await waitFor(() => lastFrame()?.includes("No repositories") ?? false);
        expect(lastFrame()).toContain("No repositories found");
        unmount();
      } finally {
        await cleanup();
      }
    });
  });

  describe("clean repos", () => {
    test("shows all clean message when no dirty repos", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "clean-repo" },
      ]);

      try {
        const { lastFrame, unmount } = render(
          <CleanApp options={{ basePath }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("All repositories are already clean") ?? false, 5000);
        expect(lastFrame()).toContain("All repositories are already clean");
        unmount();
      } finally {
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

      try {
        const { lastFrame, unmount } = render(
          <CleanApp options={{ basePath }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("WARNING") ?? false, 5000);

        const frame = lastFrame();
        expect(frame).toContain("Destructive Operation");
        expect(frame).toContain("dirty-repo");
        unmount();
      } finally {
        await cleanup();
      }
    });

    test("dry run shows preview without cleaning", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "dirty-repo" },
      ]);

      await writeFile(join(basePath, "dirty-repo", "README.md"), "modified");

      try {
        const { lastFrame, unmount } = render(
          <CleanApp options={{ basePath, dryRun: true }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Dry Run") ?? false, 5000);

        const frame = lastFrame();
        expect(frame).toContain("Cleanup Preview");
        expect(frame).toContain("dirty-repo");
        expect(frame).toContain("Would clean");
        unmount();
      } finally {
        await cleanup();
      }
    });

    test("force option skips confirmation", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "dirty-repo" },
      ]);

      await writeFile(join(basePath, "dirty-repo", "README.md"), "modified");

      try {
        const { lastFrame, unmount } = render(
          <CleanApp options={{ basePath, force: true }} onComplete={() => {}} />
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

      try {
        const { lastFrame, unmount } = render(
          <CleanApp options={{ basePath, filter: "api-*", dryRun: true }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Dry Run") ?? false, 5000);

        const frame = lastFrame();
        expect(frame).toContain("api-server");
        expect(frame).not.toContain("webapp");
        unmount();
      } finally {
        await cleanup();
      }
    });
  });
});
