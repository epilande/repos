import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useApp, useStdout } from "ink";
import SelectInput from "ink-select-input";
import Spinner from "ink-spinner";
import { StatusApp } from "../commands/status.js";
import { UpdateApp } from "../commands/update.js";
import { CloneApp } from "../commands/clone.js";
import { CleanupApp } from "../commands/cleanup.js";
import { ConfigApp } from "../commands/config.js";
import { InitApp } from "../commands/init.js";
import { loadConfig } from "../lib/config.js";
import { OptionsForm, type FormField } from "./OptionsForm.js";
import type {
  ReposConfig,
  StatusOptions,
  UpdateOptions,
  CloneOptions,
  CleanupOptions,
} from "../types.js";

type Command =
  | "status"
  | "update"
  | "clone"
  | "cleanup"
  | "config"
  | "init"
  | "exit";

interface MenuItem {
  label: string;
  value: Command;
}

const menuItems: MenuItem[] = [
  { label: "Check repository status", value: "status" },
  { label: "Update all repositories", value: "update" },
  { label: "Clone active repositories", value: "clone" },
  { label: "Cleanup repositories", value: "cleanup" },
  { label: "Configure settings", value: "config" },
  { label: "Run setup wizard", value: "init" },
  { label: "Exit", value: "exit" },
];

function getCommandFields(
  command: Command,
  config: ReposConfig,
): FormField[] | null {
  const defaultOrg = config.org || undefined;
  const defaultDays = config.daysThreshold ?? 90;
  const defaultParallel = config.parallel ?? 10;

  switch (command) {
    case "clone":
      return [
        {
          name: "dryRun",
          label: "Dry run",
          type: "toggle",
          defaultValue: false,
          hint: "Preview what would be cloned without actually cloning",
        },
        {
          name: "shallow",
          label: "Shallow clone",
          type: "toggle",
          defaultValue: false,
          hint: "Faster cloning with less disk space (no full history)",
        },
        {
          name: "org",
          label: "Organization",
          type: "text",
          defaultValue: defaultOrg,
          placeholder: defaultOrg ? `default: ${defaultOrg}` : "not configured",
          hint: "GitHub organization or username to clone from",
        },
        {
          name: "days",
          label: "Days threshold",
          type: "number",
          defaultValue: defaultDays,
          placeholder: `default: ${defaultDays}`,
          hint: "Only clone repos active within this many days",
        },
        {
          name: "parallel",
          label: "Parallel jobs",
          type: "number",
          defaultValue: defaultParallel,
          placeholder: `default: ${defaultParallel}`,
          hint: "Number of concurrent clone operations",
        },
      ];

    case "update":
      return [
        {
          name: "dryRun",
          label: "Dry run",
          type: "toggle",
          defaultValue: false,
          hint: "Preview what would be updated without actually pulling",
        },
        {
          name: "quiet",
          label: "Quiet mode",
          type: "toggle",
          defaultValue: false,
          hint: "Minimal output",
        },
        {
          name: "filter",
          label: "Filter pattern",
          type: "text",
          placeholder: "e.g., api-*",
          hint: "Only update repos matching this pattern",
        },
        {
          name: "parallel",
          label: "Parallel jobs",
          type: "number",
          defaultValue: defaultParallel,
          placeholder: `default: ${defaultParallel}`,
          hint: "Number of concurrent update operations",
        },
      ];

    case "status":
      return [
        {
          name: "fetch",
          label: "Fetch from remotes",
          type: "toggle",
          defaultValue: false,
          hint: "Fetch from remotes first to get accurate behind/ahead counts",
        },
        {
          name: "summary",
          label: "Summary only",
          type: "toggle",
          defaultValue: false,
          hint: "Show only summary counts",
        },
        {
          name: "quiet",
          label: "Quiet mode",
          type: "toggle",
          defaultValue: false,
          hint: "Only show repos with changes",
        },
        {
          name: "filter",
          label: "Filter pattern",
          type: "text",
          placeholder: "e.g., api-*",
          hint: "Only show repos matching this pattern",
        },
      ];

    case "cleanup":
      return [
        {
          name: "dryRun",
          label: "Dry run",
          type: "toggle",
          defaultValue: false,
          hint: "Preview what would be cleaned without actually cleaning",
        },
        {
          name: "all",
          label: "Remove untracked files",
          type: "toggle",
          defaultValue: false,
          hint: "Also remove untracked files (careful!)",
        },
        {
          name: "filter",
          label: "Filter pattern",
          type: "text",
          placeholder: "e.g., api-*",
          hint: "Only cleanup repos matching this pattern",
        },
      ];

    default:
      return null;
  }
}

const commandTitles: Partial<Record<Command, string>> = {
  clone: "Clone Options",
  update: "Update Options",
  status: "Status Options",
  cleanup: "Cleanup Options",
};

const commandsWithOptions: Command[] = ["clone", "update", "status", "cleanup"];

type AppState = "menu" | "loading" | "options" | "running";

type CommandOptions =
  | { command: "status"; options: StatusOptions }
  | { command: "update"; options: UpdateOptions }
  | { command: "clone"; options: CloneOptions }
  | { command: "cleanup"; options: CleanupOptions }
  | { command: "config" }
  | { command: "init" };

export function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [state, setState] = useState<AppState>("menu");
  const [selectedCommand, setSelectedCommand] = useState<Command | null>(null);
  const [config, setConfig] = useState<ReposConfig | null>(null);
  const [runningCommand, setRunningCommand] = useState<CommandOptions | null>(
    null,
  );

  useEffect(() => {
    if (state === "loading" && selectedCommand) {
      loadConfig().then((cfg) => {
        setConfig(cfg);
        setState("options");
      });
    }
  }, [state, selectedCommand]);

  const handleSelect = async (item: MenuItem) => {
    if (item.value === "exit") {
      exit();
      return;
    }

    if (commandsWithOptions.includes(item.value)) {
      setSelectedCommand(item.value);
      setState("loading");
      return;
    }

    setState("running");

    switch (item.value) {
      case "config":
        setRunningCommand({ command: "config" });
        break;
      case "init":
        setRunningCommand({ command: "init" });
        break;
    }
  };

  const handleCommandComplete = useCallback(() => {
    stdout?.write("\x1B[2J\x1B[H");
    setRunningCommand(null);
    setSelectedCommand(null);
    setConfig(null);
    setState("menu");
  }, [stdout]);

  const handleOptionsSubmit = (
    values: Record<string, boolean | string | number | undefined>,
  ) => {
    setState("running");

    switch (selectedCommand) {
      case "status":
        setRunningCommand({
          command: "status",
          options: {
            summary: values.summary as boolean | undefined,
            quiet: values.quiet as boolean | undefined,
            filter: values.filter as string | undefined,
            fetch: values.fetch as boolean | undefined,
          },
        });
        break;
      case "update":
        setRunningCommand({
          command: "update",
          options: {
            dryRun: values.dryRun as boolean | undefined,
            quiet: values.quiet as boolean | undefined,
            filter: values.filter as string | undefined,
            parallel: values.parallel as number | undefined,
            interactive: true,
          },
        });
        break;
      case "clone":
        setRunningCommand({
          command: "clone",
          options: {
            dryRun: values.dryRun as boolean | undefined,
            shallow: values.shallow as boolean | undefined,
            org: values.org as string | undefined,
            days: values.days as number | undefined,
            parallel: values.parallel as number | undefined,
            interactive: true,
          },
        });
        break;
      case "cleanup":
        setRunningCommand({
          command: "cleanup",
          options: {
            dryRun: values.dryRun as boolean | undefined,
            all: values.all as boolean | undefined,
            filter: values.filter as string | undefined,
            interactive: true,
          },
        });
        break;
    }
  };

  const handleOptionsCancel = () => {
    setSelectedCommand(null);
    setConfig(null);
    setState("menu");
  };

  if (state === "running" && runningCommand) {
    switch (runningCommand.command) {
      case "status":
        return (
          <StatusApp
            options={runningCommand.options}
            onComplete={handleCommandComplete}
          />
        );
      case "update":
        return (
          <UpdateApp
            options={runningCommand.options}
            onComplete={handleCommandComplete}
          />
        );
      case "clone":
        return (
          <CloneApp
            options={runningCommand.options}
            onComplete={handleCommandComplete}
          />
        );
      case "cleanup":
        return (
          <CleanupApp
            options={runningCommand.options}
            onComplete={handleCommandComplete}
          />
        );
      case "config":
        return (
          <ConfigApp
            options={{ list: true }}
            onComplete={handleCommandComplete}
          />
        );
      case "init":
        return (
          <InitApp
            onComplete={handleCommandComplete}
          />
        );
    }
  }

  if (state === "running") {
    return null;
  }

  if (state === "loading") {
    return (
      <Box padding={1}>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Box marginLeft={1}>
          <Text>Loading configuration...</Text>
        </Box>
      </Box>
    );
  }

  if (state === "options" && selectedCommand && config) {
    const fields = getCommandFields(selectedCommand, config);
    if (fields) {
      return (
        <OptionsForm
          title={commandTitles[selectedCommand] || "Options"}
          fields={fields}
          onSubmit={handleOptionsSubmit}
          onCancel={handleOptionsCancel}
          submitLabel={
            selectedCommand === "clone"
              ? "Clone"
              : selectedCommand === "update"
                ? "Update"
                : selectedCommand === "cleanup"
                  ? "Cleanup"
                  : "Run"
          }
        />
      );
    }
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          repos
        </Text>
        <Text color="gray"> - Repository Manager</Text>
      </Box>
      <Box marginBottom={1}>
        <Text>What would you like to do?</Text>
      </Box>
      <SelectInput items={menuItems} onSelect={handleSelect} />
      <Box marginTop={1}>
        <Text color="gray">Use arrow keys to navigate, Enter to select</Text>
      </Box>
    </Box>
  );
}
