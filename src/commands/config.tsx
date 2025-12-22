import React, { useState, useEffect } from "react";
import { render, Box, Text, useInput } from "ink";
import {
  loadConfig,
  saveConfig,
  configExists,
  getCwdConfigPath,
  getHomeConfigPath,
  getConfigValue,
  setConfigValue,
} from "../lib/config.js";
import type { ConfigOptions, ReposConfig } from "../types.js";

interface ConfigAppProps {
  options: ConfigOptions;
  onComplete?: () => void;
}

export function ConfigApp({ options, onComplete }: ConfigAppProps) {
  const [config, setConfig] = useState<ReposConfig | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configPath, setConfigPath] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);

  useInput(
    (input, key) => {
      if (key.escape && isDone) {
        onComplete?.();
      }
    },
    { isActive: !!onComplete },
  );

  useEffect(() => {
    if (!onComplete && isDone) {
      setTimeout(() => process.exit(0), 100);
    }
  }, [isDone, onComplete]);

  useEffect(() => {
    async function handleConfig() {
      try {
        const currentConfig = await loadConfig();
        setConfig(currentConfig);

        if (await configExists("cwd")) {
          setConfigPath(getCwdConfigPath());
        } else if (await configExists("home")) {
          setConfigPath(getHomeConfigPath());
        }

        if (options.get) {
          const value = getConfigValue(currentConfig, options.get);
          if (value === undefined) {
            setError(`Config key not found: ${options.get}`);
          } else {
            setMessage(
              typeof value === "object"
                ? JSON.stringify(value, null, 2)
                : String(value)
            );
          }
          setIsDone(true);
          return;
        }

        if (options.set && options.value !== undefined) {
          let parsedValue: unknown = options.value;
          try {
            parsedValue = JSON.parse(options.value);
          } catch {
          }

          const newConfig = setConfigValue(currentConfig, options.set, parsedValue);
          const location = options.location || "cwd";
          await saveConfig(newConfig, location);
          
          setConfig(newConfig);
          setConfigPath(location === "cwd" ? getCwdConfigPath() : getHomeConfigPath());
          setMessage(`Set ${options.set} = ${options.value}`);
          setIsDone(true);
          return;
        }

        setIsDone(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setIsDone(true);
      }
    }

    handleConfig();
  }, [options]);

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">Error: {error}</Text>
        {onComplete && (
          <Box marginTop={1}>
            <Text color="gray">Press Escape to return to menu</Text>
          </Box>
        )}
      </Box>
    );
  }

  if (message) {
    return (
      <Box flexDirection="column">
        <Text color="green">{message}</Text>
        {configPath && (
          <Text color="gray">Config file: {configPath}</Text>
        )}
        {onComplete && (
          <Box marginTop={1}>
            <Text color="gray">Press Escape to return to menu</Text>
          </Box>
        )}
      </Box>
    );
  }

  if (!config) {
    return (
      <Box>
        <Text color="gray">Loading configuration...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">
        Current Configuration
      </Text>
      {configPath ? (
        <Text color="gray">File: {configPath}</Text>
      ) : (
        <Text color="gray">Using defaults (no config file found)</Text>
      )}
      <Box marginTop={1} flexDirection="column">
        <ConfigValue label="github.host" value={config.github?.host} />
        <ConfigValue label="github.apiUrl" value={config.github?.apiUrl} />
        <ConfigValue label="org" value={config.org} />
        <ConfigValue label="daysThreshold" value={config.daysThreshold} />
        <ConfigValue label="parallel" value={config.parallel} />
        <ConfigValue label="timeout" value={config.timeout} />
      </Box>
      <Box marginTop={1}>
        <Text color="gray">
          Use 'repos config --set KEY VALUE' to change a value
        </Text>
      </Box>
      {onComplete && (
        <Box marginTop={1}>
          <Text color="gray">Press Escape to return to menu</Text>
        </Box>
      )}
    </Box>
  );
}

interface ConfigValueProps {
  label: string;
  value: unknown;
}

function ConfigValue({ label, value }: ConfigValueProps) {
  const displayValue =
    value === undefined || value === "" ? (
      <Text color="gray">(not set)</Text>
    ) : (
      <Text color="green">{String(value)}</Text>
    );

  return (
    <Box>
      <Box width={20}>
        <Text>{label}:</Text>
      </Box>
      {displayValue}
    </Box>
  );
}

export async function runConfig(options: ConfigOptions): Promise<void> {
  const { waitUntilExit } = render(<ConfigApp options={options} />);
  await waitUntilExit();
}

