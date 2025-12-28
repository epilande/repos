#!/usr/bin/env bun
import { program } from "commander";
import { render } from "ink";
import React from "react";
import { App } from "./components/App.js";
import { runStatus } from "./commands/status.js";
import { runPull } from "./commands/pull.js";
import { runClone } from "./commands/clone.js";
import { runClean } from "./commands/clean.js";
import { runConfig } from "./commands/config.js";
import { runInit } from "./commands/init.js";
import { runFetch } from "./commands/fetch.js";
import { runDiff } from "./commands/diff.js";
import { runCheckout } from "./commands/checkout.js";
import { runExec } from "./commands/exec.js";
import packageJson from "../package.json";

const VERSION = packageJson.version;

function showDeprecationWarning(oldName: string, newName: string) {
  console.warn(
    `\x1b[33mWarning: 'repos ${oldName}' is deprecated. Use 'repos ${newName}' instead.\x1b[0m\n`
  );
}

program
  .name("repos")
  .description("A CLI tool for managing multiple git repositories")
  .version(VERSION);

program.action(async () => {
  const { waitUntilExit } = render(React.createElement(App));
  await waitUntilExit();
  process.exit(0);
});

program
  .command("init")
  .description("Setup wizard for configuring repos CLI")
  .option("-f, --force", "Overwrite existing configuration")
  .action(async (options) => {
    await runInit(options.force);
  });

program
  .command("status")
  .description("Check status of all repositories")
  .option("-s, --summary", "Show only summary counts")
  .option("-q, --quiet", "Minimal output, only show repos with changes")
  .option("-f, --filter <pattern>", "Filter repos by pattern (e.g., 'api-*')")
  .option("--fetch", "Fetch from remotes before checking status")
  .action(async (options) => {
    await runStatus({
      summary: options.summary,
      quiet: options.quiet,
      filter: options.filter,
      fetch: options.fetch,
    });
  });

program
  .command("fetch")
  .description("Fetch latest changes from remotes for all repositories")
  .option("-n, --dry-run", "Show what would be fetched without fetching")
  .option("-q, --quiet", "Minimal output")
  .option("-f, --filter <pattern>", "Filter repos by pattern (e.g., 'api-*')")
  .option("-p, --parallel <number>", "Number of parallel operations", parseInt)
  .option("--prune", "Remove remote-tracking references that no longer exist")
  .option("-a, --all", "Fetch from all remotes")
  .action(async (options) => {
    await runFetch({
      dryRun: options.dryRun,
      quiet: options.quiet,
      filter: options.filter,
      parallel: options.parallel,
      prune: options.prune,
      all: options.all,
    });
  });

program
  .command("pull")
  .description("Pull latest changes for all repositories")
  .option("-n, --dry-run", "Show what would be updated without pulling")
  .option("-q, --quiet", "Minimal output")
  .option("-f, --filter <pattern>", "Filter repos by pattern (e.g., 'api-*')")
  .option("-p, --parallel <number>", "Number of parallel operations", parseInt)
  .action(async (options) => {
    await runPull({
      dryRun: options.dryRun,
      quiet: options.quiet,
      filter: options.filter,
      parallel: options.parallel,
    });
  });

program
  .command("update")
  .description("(Deprecated: use 'pull') Pull latest changes for all repositories")
  .option("-n, --dry-run", "Show what would be updated without pulling")
  .option("-q, --quiet", "Minimal output")
  .option("-f, --filter <pattern>", "Filter repos by pattern (e.g., 'api-*')")
  .option("-p, --parallel <number>", "Number of parallel operations", parseInt)
  .action(async (options) => {
    showDeprecationWarning("update", "pull");
    await runPull({
      dryRun: options.dryRun,
      quiet: options.quiet,
      filter: options.filter,
      parallel: options.parallel,
    });
  });

program
  .command("clone")
  .description("Clone active repositories from GitHub organization")
  .option("-n, --dry-run", "Show what would be cloned without cloning")
  .option("-o, --org <name>", "GitHub organization or username")
  .option("-h, --host <host>", "GitHub host (default: github.com)")
  .option("-d, --days <number>", "Activity threshold in days", parseInt)
  .option("-p, --parallel <number>", "Number of parallel clone operations (default: 10)", parseInt)
  .option("-s, --shallow", "Shallow clone (faster, uses less disk space)")
  .action(async (options) => {
    await runClone({
      dryRun: options.dryRun,
      org: options.org,
      host: options.host,
      days: options.days,
      parallel: options.parallel,
      shallow: options.shallow,
    });
  });

program
  .command("clean")
  .description("Clean repositories by reverting changes")
  .option("-n, --dry-run", "Show what would be cleaned without cleaning")
  .option("--force", "Skip confirmation prompt")
  .option("-a, --all", "Also remove untracked files")
  .option("-f, --filter <pattern>", "Filter repos by pattern (e.g., 'api-*')")
  .action(async (options) => {
    await runClean({
      dryRun: options.dryRun,
      force: options.force,
      all: options.all,
      filter: options.filter,
    });
  });

program
  .command("cleanup")
  .description("(Deprecated: use 'clean') Clean repositories by reverting changes")
  .option("-n, --dry-run", "Show what would be cleaned without cleaning")
  .option("-f, --force", "Skip confirmation prompt")
  .option("-a, --all", "Also remove untracked files")
  .option("--filter <pattern>", "Filter repos by pattern (e.g., 'api-*')")
  .action(async (options) => {
    showDeprecationWarning("cleanup", "clean");
    await runClean({
      dryRun: options.dryRun,
      force: options.force,
      all: options.all,
      filter: options.filter,
    });
  });

program
  .command("diff")
  .description("Show diffs across all repositories")
  .option("-q, --quiet", "Only list repos with changes (no diff output)")
  .option("--stat", "Show diffstat summary instead of full diff")
  .option("-f, --filter <pattern>", "Filter repos by pattern (e.g., 'api-*')")
  .option("-p, --parallel <number>", "Number of parallel operations", parseInt)
  .option("-m, --max-lines <number>", "Max lines per diff (default: 500, 0 for unlimited)", parseInt)
  .action(async (options) => {
    await runDiff({
      quiet: options.quiet,
      stat: options.stat,
      filter: options.filter,
      parallel: options.parallel,
      maxLines: options.maxLines,
    });
  });

program
  .command("checkout <branch>")
  .description("Switch branches across all repositories")
  .option("-b, --create", "Create branch if it doesn't exist")
  .option("--force", "Skip repos with uncommitted changes")
  .option("-f, --filter <pattern>", "Filter repos by pattern (e.g., 'api-*')")
  .option("-p, --parallel <number>", "Number of parallel operations", parseInt)
  .action(async (branch, options) => {
    await runCheckout({
      branch,
      create: options.create,
      force: options.force,
      filter: options.filter,
      parallel: options.parallel,
    });
  });

program
  .command("exec <command>")
  .description("Run arbitrary command across all repositories")
  .option("-q, --quiet", "Only show output for repos with non-empty results")
  .option("-p, --parallel <number>", "Number of parallel operations", parseInt)
  .option("-f, --filter <pattern>", "Filter repos by pattern (e.g., 'api-*')")
  .action(async (command, options) => {
    await runExec({
      command,
      quiet: options.quiet,
      parallel: options.parallel,
      filter: options.filter,
    });
  });

program
  .command("config")
  .description("View or modify configuration")
  .option("-g, --get <key>", "Get a specific config value")
  .option("-s, --set <key>", "Set a config value")
  .option("-v, --value <value>", "Value to set")
  .option("-l, --list", "List all config values")
  .option("--location <loc>", "Config file location (cwd or home)")
  .action(async (options) => {
    await runConfig({
      get: options.get,
      set: options.set,
      value: options.value,
      list: options.list || (!options.get && !options.set),
      location: options.location,
    });
  });

program.parse();

