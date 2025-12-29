import React, { useState, useEffect } from "react";
import { render, Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import {
  saveConfig,
  configExists,
  getCwdConfigPath,
  getHomeConfigPath,
} from "../lib/config.js";
import {
  checkGhCli,
  detectGitHubHost,
  getApiUrl,
} from "../lib/github.js";
import type { ReposConfig, GitHubConfig } from "../types.js";

type Step =
  | "checking"
  | "gh-detected"
  | "host-select"
  | "host-custom"
  | "org-input"
  | "days-input"
  | "location-select"
  | "saving"
  | "done";

interface InitAppProps {
  force?: boolean;
  basePath?: string;
  onComplete?: () => void;
}

export function InitApp({ force, basePath, onComplete }: InitAppProps) {
  const [step, setStep] = useState<Step>("checking");
  const [ghCliInfo, setGhCliInfo] = useState<{
    available: boolean;
    authenticated: boolean;
    hosts: string[];
  } | null>(null);
  const [detectedHost, setDetectedHost] = useState<string | null>(null);
  const [selectedHost, setSelectedHost] = useState<string>("github.com");
  const [customHost, setCustomHost] = useState<string>("");
  const [org, setOrg] = useState<string>("");
  const [days, setDays] = useState<string>("90");
  const [saveLocation, setSaveLocation] = useState<"cwd" | "home">("cwd");
  const [error, setError] = useState<string | null>(null);

  useInput(
    (input, key) => {
      if (key.escape || key.delete) {
        onComplete?.();
      }
    },
    { isActive: !!onComplete && step !== "checking" && step !== "saving" },
  );

  useEffect(() => {
    if (!onComplete && step === "done") {
      setTimeout(() => process.exit(0), 100);
    }
  }, [step, onComplete]);

  useEffect(() => {
    async function check() {
      if (!force && (await configExists("any", basePath))) {
        setError(
          "Configuration already exists. Use --force to overwrite or 'repos config' to view/edit."
        );
        setStep("done");
        return;
      }

      const ghInfo = await checkGhCli();
      setGhCliInfo(ghInfo);

      const detected = await detectGitHubHost();
      if (detected) {
        setDetectedHost(detected);
        setSelectedHost(detected);
      }

      if (ghInfo.authenticated && ghInfo.hosts.length > 0) {
        setStep("gh-detected");
      } else {
        setStep("host-select");
      }
    }

    check();
  }, [force]);

  useEffect(() => {
    if (step !== "saving") return;

    async function save() {
      const host = selectedHost === "custom" ? customHost : selectedHost;
      const github: GitHubConfig = {
        host,
        apiUrl: getApiUrl(host),
      };

      const config: ReposConfig = {
        github,
        org,
        daysThreshold: parseInt(days) || 90,
        parallel: 10,
      };

      await saveConfig(config, saveLocation, basePath);
      setStep("done");
    }

    save();
  }, [step, selectedHost, customHost, org, days, saveLocation, basePath]);

  if (error && step === "done") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">{error}</Text>
        {onComplete && (
          <Box marginTop={1}>
            <Text dimColor>⌫/Esc Back</Text>
          </Box>
        )}
      </Box>
    );
  }

  if (step === "checking") {
    return (
      <Box padding={1}>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Box marginLeft={1}>
          <Text>Checking environment...</Text>
        </Box>
      </Box>
    );
  }

  if (step === "gh-detected" && ghCliInfo) {
    const items = [
      {
        label: `Use gh CLI authentication (${ghCliInfo.hosts.join(", ")})`,
        value: "use-gh",
      },
      { label: "Configure manually", value: "manual" },
    ];

    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">
          repos init - Setup Wizard
        </Text>
        <Box marginTop={1}>
          <Text color="green">✓ Found gh CLI configuration</Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text>How would you like to configure GitHub access?</Text>
          <Box marginTop={1}>
            <SelectInput
              items={items}
              onSelect={(item) => {
                if (item.value === "use-gh") {
                  setSelectedHost(ghCliInfo.hosts[0] || "github.com");
                  setStep("org-input");
                } else {
                  setStep("host-select");
                }
              }}
            />
          </Box>
        </Box>
        {onComplete && (
          <Box marginTop={1}>
            <Text dimColor>↑↓ Navigate • Enter Select • ⌫/Esc Back</Text>
          </Box>
        )}
      </Box>
    );
  }

  if (step === "host-select") {
    const items = [
      { label: "github.com (GitHub Cloud)", value: "github.com" },
      { label: "Custom (GitHub Enterprise)", value: "custom" },
    ];

    if (detectedHost && detectedHost !== "github.com") {
      items.unshift({
        label: `${detectedHost} (detected from repos)`,
        value: detectedHost,
      });
    }

    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">
          repos init - Setup Wizard
        </Text>
        <Box marginTop={1} flexDirection="column">
          <Text>Select GitHub host:</Text>
          <Box marginTop={1}>
            <SelectInput
              items={items}
              onSelect={(item) => {
                if (item.value === "custom") {
                  setStep("host-custom");
                } else {
                  setSelectedHost(item.value);
                  setStep("org-input");
                }
              }}
            />
          </Box>
        </Box>
        {onComplete && (
          <Box marginTop={1}>
            <Text dimColor>↑↓ Navigate • Enter Select • ⌫/Esc Back</Text>
          </Box>
        )}
      </Box>
    );
  }

  if (step === "host-custom") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">
          repos init - Setup Wizard
        </Text>
        <Box marginTop={1} flexDirection="column">
          <Text>Enter GitHub Enterprise host (e.g., github.mycompany.com):</Text>
          <Box marginTop={1}>
            <Text color="cyan">{">"} </Text>
            <TextInput
              value={customHost}
              onChange={setCustomHost}
              onSubmit={() => {
                if (customHost.trim()) {
                  setSelectedHost("custom");
                  setStep("org-input");
                }
              }}
            />
          </Box>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>
            Enter Continue{onComplete && " • ⌫/Esc Back"}
          </Text>
        </Box>
      </Box>
    );
  }

  if (step === "org-input") {
    const host = selectedHost === "custom" ? customHost : selectedHost;

    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">
          repos init - Setup Wizard
        </Text>
        <Box marginTop={1}>
          <Text dimColor>Host: {host}</Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text>Enter organization or username:</Text>
          <Box marginTop={1}>
            <Text color="cyan">{">"} </Text>
            <TextInput
              value={org}
              onChange={setOrg}
              onSubmit={() => {
                if (org.trim()) {
                  setStep("days-input");
                }
              }}
            />
          </Box>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>
            Enter Continue{onComplete && " • ⌫/Esc Back"}
          </Text>
        </Box>
      </Box>
    );
  }

  if (step === "days-input") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">
          repos init - Setup Wizard
        </Text>
        <Box marginTop={1}>
          <Text dimColor>
            Host: {selectedHost === "custom" ? customHost : selectedHost}
          </Text>
        </Box>
        <Box>
          <Text dimColor>Org: {org}</Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text>Activity threshold (days to consider repo active):</Text>
          <Box marginTop={1}>
            <Text color="cyan">{">"} </Text>
            <TextInput
              value={days}
              onChange={setDays}
              onSubmit={() => {
                setStep("location-select");
              }}
            />
          </Box>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>
            Enter Continue (default: 90){onComplete && " • ⌫/Esc Back"}
          </Text>
        </Box>
      </Box>
    );
  }

  if (step === "location-select") {
    const items = [
      {
        label: `Current directory (${getCwdConfigPath(basePath)})`,
        value: "cwd" as const,
      },
      {
        label: `Home directory (${getHomeConfigPath()})`,
        value: "home" as const,
      },
    ];

    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">
          repos init - Setup Wizard
        </Text>
        <Box marginTop={1}>
          <Text dimColor>
            Host: {selectedHost === "custom" ? customHost : selectedHost}
          </Text>
        </Box>
        <Box>
          <Text dimColor>Org: {org}</Text>
        </Box>
        <Box>
          <Text dimColor>Days: {days}</Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text>Save configuration to:</Text>
          <Box marginTop={1}>
            <SelectInput
              items={items}
              onSelect={(item) => {
                setSaveLocation(item.value);
                setStep("saving");
              }}
            />
          </Box>
        </Box>
        {onComplete && (
          <Box marginTop={1}>
            <Text dimColor>↑↓ Navigate • Enter Select • ⌫/Esc Back</Text>
          </Box>
        )}
      </Box>
    );
  }

  if (step === "saving") {
    return (
      <Box padding={1}>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Box marginLeft={1}>
          <Text>Saving configuration...</Text>
        </Box>
      </Box>
    );
  }

  const configPath =
    saveLocation === "cwd" ? getCwdConfigPath(basePath) : getHomeConfigPath();

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="green">
        ✓ Configuration saved!
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>File: {configPath}</Text>
        <Box marginTop={1} flexDirection="column">
          <Text>
            Host: {selectedHost === "custom" ? customHost : selectedHost}
          </Text>
          <Text>Org: {org}</Text>
          <Text>Activity threshold: {days} days</Text>
        </Box>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color="cyan">Next steps:</Text>
        <Text dimColor> • repos clone - Clone active repositories</Text>
        <Text dimColor> • repos status - Check repository status</Text>
        <Text dimColor> • repos --help - See all commands</Text>
      </Box>
      {onComplete && (
        <Box marginTop={1}>
          <Text dimColor>⌫/Esc Back</Text>
        </Box>
      )}
    </Box>
  );
}

export async function runInit(force?: boolean): Promise<void> {
  const { waitUntilExit } = render(<InitApp force={force} />);
  await waitUntilExit();
}

