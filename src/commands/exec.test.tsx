import { describe, test, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { ExecApp } from "./exec.js";
import { createTempRepoDir } from "../../tests/helpers/temp-repos.js";
import { waitFor } from "../../tests/helpers/ink-test-utils.js";

describe("ExecApp", () => {
  describe("rendering phases", () => {
    test("shows finding phase initially", async () => {
      const { lastFrame, unmount } = render(
        <ExecApp options={{ command: "echo hello" }} onComplete={() => {}} />
      );

      expect(lastFrame()).toContain("Finding repositories");
      unmount();
    });

    test("shows error when no repos found", async () => {
      const tempDir = `/tmp/empty-exec-${Date.now()}`;
      const { mkdir, rm } = await import("fs/promises");
      await mkdir(tempDir, { recursive: true });

      const originalCwd = process.cwd();
      process.chdir(tempDir);

      try {
        const { lastFrame, unmount } = render(
          <ExecApp options={{ command: "echo hello" }} onComplete={() => {}} />
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

  describe("command execution", () => {
    test("executes command successfully", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "repo-a" },
      ]);

      const originalCwd = process.cwd();
      process.chdir(basePath);

      try {
        const { lastFrame, unmount } = render(
          <ExecApp options={{ command: "echo hello" }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Summary") ?? false, 5000);

        const frame = lastFrame();
        expect(frame).toContain("repo-a");
        expect(frame).toContain("hello");
        expect(frame).toContain("Successful:");
        unmount();
      } finally {
        process.chdir(originalCwd);
        await cleanup();
      }
    });

    test("shows command output for each repo", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "repo-a" },
        { name: "repo-b" },
      ]);

      const originalCwd = process.cwd();
      process.chdir(basePath);

      try {
        const { lastFrame, unmount } = render(
          <ExecApp options={{ command: "pwd" }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Summary") ?? false, 5000);

        const frame = lastFrame();
        expect(frame).toContain("repo-a");
        expect(frame).toContain("repo-b");
        unmount();
      } finally {
        process.chdir(originalCwd);
        await cleanup();
      }
    });

    test("handles command failures", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "repo-a" },
      ]);

      const originalCwd = process.cwd();
      process.chdir(basePath);

      try {
        const { lastFrame, unmount } = render(
          <ExecApp options={{ command: "exit 1" }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Summary") ?? false, 5000);

        const frame = lastFrame();
        expect(frame).toContain("Failed:");
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
          <ExecApp options={{ command: "echo test", filter: "api-*" }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("Summary") ?? false, 5000);

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

  describe("parallel option", () => {
    test("respects parallel count in header", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "repo-a" },
      ]);

      const originalCwd = process.cwd();
      process.chdir(basePath);

      try {
        const { lastFrame, unmount } = render(
          <ExecApp options={{ command: "echo test", parallel: 2 }} onComplete={() => {}} />
        );

        await waitFor(() => lastFrame()?.includes("parallel: 2") ?? false, 5000);

        const frame = lastFrame();
        expect(frame).toContain("parallel: 2");
        unmount();
      } finally {
        process.chdir(originalCwd);
        await cleanup();
      }
    });
  });
});
