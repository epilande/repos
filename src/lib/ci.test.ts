import { describe, test, expect, spyOn } from "bun:test";
import {
  ciStatus,
  ciFetch,
  ciDiff,
  ciCheckout,
  ciExec,
  ciClean,
  ciConfig,
} from "./ci.js";
import { createTempRepoDir } from "../../tests/helpers/temp-repos.js";

// Capture console.log and console.error output
function captureOutput() {
  const lines: string[] = [];
  const errors: string[] = [];

  const logSpy = spyOn(console, "log").mockImplementation(
    (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    },
  );
  const errorSpy = spyOn(console, "error").mockImplementation(
    (...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    },
  );

  return {
    lines,
    errors,
    output: () => lines.join("\n"),
    errorOutput: () => errors.join("\n"),
    restore: () => {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    },
  };
}

describe("CI output", () => {
  describe("ciStatus", () => {
    test("shows table with repo status", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "clean-repo" },
        { name: "dirty-repo", dirty: true },
      ]);
      const out = captureOutput();

      try {
        await ciStatus({ basePath });
        const output = out.output();

        expect(output).toContain("Repository");
        expect(output).toContain("Branch");
        expect(output).toContain("clean-repo");
        expect(output).toContain("dirty-repo");
        expect(output).toContain("Repositories:");
      } finally {
        out.restore();
        await cleanup();
      }
    });

    test("summary mode shows counts", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "repo-a" },
        { name: "repo-b", dirty: true },
      ]);
      const out = captureOutput();

      try {
        await ciStatus({ basePath, summary: true });
        const output = out.output();

        expect(output).toContain("Total: 2 repositories");
        expect(output).toContain("Clean: 1");
        expect(output).toContain("With changes: 1");
        // Should not contain repo table rows
        expect(output).not.toContain("repo-a");
      } finally {
        out.restore();
        await cleanup();
      }
    });

    test("quiet mode only shows dirty repos", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "clean-repo" },
        { name: "dirty-repo", dirty: true },
      ]);
      const out = captureOutput();

      try {
        await ciStatus({ basePath, quiet: true });
        const output = out.output();

        expect(output).toContain("dirty-repo");
        expect(output).not.toContain("clean-repo");
      } finally {
        out.restore();
        await cleanup();
      }
    });

    test("quiet mode shows all-clean message", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "clean-repo" },
      ]);
      const out = captureOutput();

      try {
        await ciStatus({ basePath, quiet: true });
        const output = out.output();
        expect(output).toContain("All 1 repositories are clean");
      } finally {
        out.restore();
        await cleanup();
      }
    });

    test("filter limits repos", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "api-service" },
        { name: "web-app" },
      ]);
      const out = captureOutput();

      try {
        await ciStatus({ basePath, filter: "api-*" });
        const output = out.output();

        expect(output).toContain("api-service");
        expect(output).not.toContain("web-app");
      } finally {
        out.restore();
        await cleanup();
      }
    });
  });

  describe("ciDiff", () => {
    test("shows clean message when no diffs", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "clean-repo" },
      ]);
      const out = captureOutput();

      try {
        await ciDiff({ basePath });
        expect(out.output()).toContain("All repositories are clean");
      } finally {
        out.restore();
        await cleanup();
      }
    });

    test("quiet mode lists repos with changes", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "clean-repo" },
        { name: "dirty-repo" },
      ]);
      // Modify a tracked file to create an unstaged diff
      const { writeFile } = await import("fs/promises");
      const { join } = await import("path");
      await writeFile(
        join(basePath, "dirty-repo", "README.md"),
        "modified content",
      );

      const out = captureOutput();

      try {
        await ciDiff({ basePath, quiet: true });
        const output = out.output();
        expect(output).toContain("dirty-repo");
        expect(output).not.toContain("clean-repo");
      } finally {
        out.restore();
        await cleanup();
      }
    });
  });

  describe("ciExec", () => {
    test("runs command across repos", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "repo-a" },
        { name: "repo-b" },
      ]);
      const out = captureOutput();

      try {
        await ciExec({ command: "echo hello", basePath });
        const output = out.output();

        expect(output).toContain("✓ repo-a");
        expect(output).toContain("✓ repo-b");
        expect(output).toContain("hello");
        expect(output).toContain("Successful: 2");
      } finally {
        out.restore();
        await cleanup();
      }
    });

    test("quiet mode suppresses empty output", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "repo-a" },
      ]);
      const out = captureOutput();

      try {
        await ciExec({ command: "true", basePath, quiet: true });
        const output = out.output();
        // Should only have the summary line, not the repo name
        expect(output).not.toContain("✓ repo-a");
        expect(output).toContain("Successful: 1");
      } finally {
        out.restore();
        await cleanup();
      }
    });
  });

  describe("ciClean", () => {
    test("shows all-clean message when nothing to clean", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "clean-repo" },
      ]);
      const out = captureOutput();

      try {
        await ciClean({ basePath });
        expect(out.output()).toContain("All repositories are already clean");
      } finally {
        out.restore();
        await cleanup();
      }
    });

    test("dry-run lists what would be cleaned", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "dirty-repo", staged: true },
      ]);
      const out = captureOutput();

      try {
        await ciClean({ basePath, dryRun: true });
        const output = out.output();
        expect(output).toContain("Would clean 1 repositories");
        expect(output).toContain("dirty-repo");
      } finally {
        out.restore();
        await cleanup();
      }
    });

    test("refuses without --force in non-interactive mode", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "dirty-repo", staged: true },
      ]);
      const out = captureOutput();

      // Mock process.exit to prevent test from exiting
      const exitSpy = spyOn(process, "exit").mockImplementation((() => {}) as (
        code?: number,
      ) => never);

      try {
        await ciClean({ basePath });
        expect(out.errorOutput()).toContain("--force");
        expect(exitSpy).toHaveBeenCalledWith(1);
      } finally {
        out.restore();
        exitSpy.mockRestore();
        await cleanup();
      }
    });
  });

  describe("ciConfig", () => {
    test("lists config with defaults", async () => {
      const out = captureOutput();

      try {
        await ciConfig({ list: true });
        const output = out.output();
        expect(output).toContain("github.host:");
        expect(output).toContain("parallel:");
        expect(output).toContain("timeout:");
      } finally {
        out.restore();
      }
    });
  });

  describe("ciCheckout", () => {
    test("switches branches across repos", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "repo-a" },
        { name: "repo-b" },
      ]);
      const out = captureOutput();

      try {
        await ciCheckout({ basePath, branch: "main" });
        const output = out.output();
        expect(output).toContain("repo-a");
        expect(output).toContain("repo-b");
        expect(output).toContain("Switched:");
      } finally {
        out.restore();
        await cleanup();
      }
    });
  });

  describe("ciFetch", () => {
    test("dry-run lists repos", async () => {
      const { basePath, cleanup } = await createTempRepoDir([
        { name: "repo-a" },
        { name: "repo-b" },
      ]);
      const out = captureOutput();

      try {
        await ciFetch({ basePath, dryRun: true });
        const output = out.output();
        expect(output).toContain("Would fetch 2 repositories");
        expect(output).toContain("repo-a");
        expect(output).toContain("repo-b");
      } finally {
        out.restore();
        await cleanup();
      }
    });
  });
});
