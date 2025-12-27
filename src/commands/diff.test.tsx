import { describe, test, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { DiffApp } from "./diff.js";
import { createTempRepoDir, createEmptyTempDir } from "../../tests/helpers/temp-repos.js";
import { waitFor } from "../../tests/helpers/ink-test-utils.js";
import { writeFile } from "fs/promises";
import { join } from "path";

describe("DiffApp", () => {
  describe("rendering phases", () => {
    test("shows finding phase initially", async () => {
      const { path, cleanup } = await createEmptyTempDir();
      try {
        const { lastFrame, unmount } = render(
          <DiffApp options={{ basePath: path }} onComplete={() => {}} />
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
          <DiffApp options={{ basePath: path }} onComplete={() => {}} />
        );
        await waitFor(() => lastFrame()?.includes("No repositories") ?? false);
        expect(lastFrame()).toContain("No repositories found");
        unmount();
      } finally {
        await cleanup();
      }
    });
  });

  describe("diff output", () => {
    test("shows all clean message when no changes", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "clean-repo" },
      ]);

      try {
        const { lastFrame, unmount } = render(
          <DiffApp options={{ basePath }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Summary") ?? false, 5000);

        const frame = lastFrame();
        expect(frame).toContain("All repositories are clean");
        unmount();
      } finally {
        await cleanup();
      }
    });

    test("shows diff for modified repos", async () => {
      const { basePath, repos, cleanup } = await createTempRepoDir([
        { name: "modified-repo" },
      ]);

      await writeFile(join(repos[0].path, "README.md"), "modified content");

      try {
        const { lastFrame, unmount } = render(
          <DiffApp options={{ basePath }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Summary") ?? false, 5000);

        const frame = lastFrame();
        expect(frame).toContain("modified-repo");
        expect(frame).toContain("modified content");
        unmount();
      } finally {
        await cleanup();
      }
    });

    test("quiet mode only lists repos with changes", async () => {
      const { basePath, repos, cleanup } = await createTempRepoDir([
        { name: "clean-repo" },
        { name: "dirty-repo" },
      ]);

      await writeFile(join(repos[1].path, "README.md"), "modified");

      try {
        const { lastFrame, unmount } = render(
          <DiffApp options={{ basePath, quiet: true }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Summary") ?? false, 5000);

        const frame = lastFrame();
        expect(frame).toContain("dirty-repo");
        expect(frame).toContain("Repositories with changes");
        // Should not show the full diff, just the list
        expect(frame).not.toContain("modified content");
        unmount();
      } finally {
        await cleanup();
      }
    });

    test("stat mode shows diffstat", async () => {
      const { basePath, repos, cleanup } = await createTempRepoDir([
        { name: "modified-repo" },
      ]);

      await writeFile(join(repos[0].path, "README.md"), "modified content");

      try {
        const { lastFrame, unmount } = render(
          <DiffApp options={{ basePath, stat: true }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Summary") ?? false, 5000);

        const frame = lastFrame();
        // Diffstat shows file changes like "1 file changed"
        expect(frame).toContain("modified-repo");
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
          <DiffApp options={{ basePath, filter: "api-*" }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Summary") ?? false, 5000);

        const frame = lastFrame();
        expect(frame).toContain("api-server");
        expect(frame).not.toContain("webapp");
        unmount();
      } finally {
        await cleanup();
      }
    });
  });

  describe("summary", () => {
    test("shows correct counts in summary", async () => {
      const { basePath, repos, cleanup } = await createTempRepoDir([
        { name: "clean-repo" },
        { name: "dirty-repo" },
      ]);

      await writeFile(join(repos[1].path, "README.md"), "modified");

      try {
        const { lastFrame, unmount } = render(
          <DiffApp options={{ basePath }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Summary") ?? false, 5000);

        const frame = lastFrame();
        expect(frame).toContain("Repositories checked:");
        expect(frame).toContain("With changes:");
        expect(frame).toContain("Clean:");
        unmount();
      } finally {
        await cleanup();
      }
    });
  });
});
