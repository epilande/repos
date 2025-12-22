#!/usr/bin/env bun
import { program } from "commander";
import { render } from "ink";
import React from "react";
import { App } from "./components/App.js";
import { runStatus } from "./commands/status.js";
import { runUpdate } from "./commands/update.js";
import { runClone } from "./commands/clone.js";
import { runCleanup } from "./commands/cleanup.js";
import { runConfig } from "./commands/config.js";
import { runInit } from "./commands/init.js";
import packageJson from "../package.json";

const VERSION = packageJson.version;

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
  .command("update")
  .description("Pull latest changes for all repositories")
  .option("-n, --dry-run", "Show what would be updated without pulling")
  .option("-q, --quiet", "Minimal output")
  .option("-f, --filter <pattern>", "Filter repos by pattern (e.g., 'api-*')")
  .option("-p, --parallel <number>", "Number of parallel operations", parseInt)
  .action(async (options) => {
    await runUpdate({
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
  .command("cleanup")
  .description("Clean repositories by reverting changes")
  .option("-n, --dry-run", "Show what would be cleaned without cleaning")
  .option("-f, --force", "Skip confirmation prompt")
  .option("-a, --all", "Also remove untracked files")
  .option("--filter <pattern>", "Filter repos by pattern (e.g., 'api-*')")
  .action(async (options) => {
    await runCleanup({
      dryRun: options.dryRun,
      force: options.force,
      all: options.all,
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

