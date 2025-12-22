import { $ } from "bun";
import { homedir } from "os";
import { join } from "path";
import type { ReposConfig, GhCliConfig, GhCliHost } from "../types.js";
import { DEFAULT_CONFIG } from "../types.js";

const CONFIG_FILENAME = ".reposrc.json";
const GH_CONFIG_PATH = join(homedir(), ".config", "gh", "hosts.yml");

async function loadConfigFile(path: string): Promise<ReposConfig | null> {
  try {
    const file = Bun.file(path);
    if (await file.exists()) {
      const content = await file.text();
      return JSON.parse(content) as ReposConfig;
    }
  } catch {
  }
  return null;
}

export function getCwdConfigPath(): string {
  return join(process.cwd(), CONFIG_FILENAME);
}

export function getHomeConfigPath(): string {
  return join(homedir(), CONFIG_FILENAME);
}

export async function loadConfig(): Promise<ReposConfig> {
  const cwdConfig = await loadConfigFile(getCwdConfigPath());
  if (cwdConfig) return mergeConfig(DEFAULT_CONFIG, cwdConfig);

  const homeConfig = await loadConfigFile(getHomeConfigPath());
  if (homeConfig) return mergeConfig(DEFAULT_CONFIG, homeConfig);

  return { ...DEFAULT_CONFIG };
}

function mergeConfig(
  defaults: Required<ReposConfig>,
  user: ReposConfig
): ReposConfig {
  return {
    github: {
      ...defaults.github,
      ...user.github,
    },
    org: user.org ?? defaults.org,
    daysThreshold: user.daysThreshold ?? defaults.daysThreshold,
    parallel: user.parallel ?? defaults.parallel,
    timeout: user.timeout ?? defaults.timeout,
  };
}

export async function saveConfig(
  config: ReposConfig,
  location: "cwd" | "home" = "cwd"
): Promise<void> {
  const path = location === "cwd" ? getCwdConfigPath() : getHomeConfigPath();
  await Bun.write(path, JSON.stringify(config, null, 2) + "\n");
}

export async function configExists(
  location: "cwd" | "home" | "any" = "any"
): Promise<boolean> {
  if (location === "cwd" || location === "any") {
    const cwdExists = await Bun.file(getCwdConfigPath()).exists();
    if (cwdExists) return true;
  }

  if (location === "home" || location === "any") {
    const homeExists = await Bun.file(getHomeConfigPath()).exists();
    if (homeExists) return true;
  }

  return false;
}

function parseGhHostsYaml(content: string): GhCliConfig {
  const hosts: Record<string, GhCliHost> = {};
  let currentHost: string | null = null;

  const lines = content.split("\n");
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const hostMatch = line.match(/^(\S+):$/);
    if (hostMatch) {
      currentHost = hostMatch[1];
      hosts[currentHost] = {};
      continue;
    }

    if (currentHost) {
      const propMatch = line.match(/^\s+(\w+):\s*(.*)$/);
      if (propMatch) {
        const [, key, value] = propMatch;
        const host = hosts[currentHost];
        if (key === "oauth_token") {
          host.oauthToken = value;
        } else if (key === "user") {
          host.user = value;
        } else if (key === "git_protocol") {
          host.gitProtocol = value;
        }
      }
    }
  }

  return { hosts };
}

export async function loadGhCliConfig(): Promise<GhCliConfig | null> {
  try {
    const file = Bun.file(GH_CONFIG_PATH);
    if (await file.exists()) {
      const content = await file.text();
      return parseGhHostsYaml(content);
    }
  } catch {
  }
  return null;
}

export async function isGhCliConfigured(
  host: string = "github.com"
): Promise<boolean> {
  const token = await getGhCliToken(host);
  return token !== null;
}

export async function getGhCliToken(
  host: string = "github.com"
): Promise<string | null> {
  try {
    const result = await $`gh auth token --hostname ${host}`.quiet();
    if (result.exitCode === 0) {
      const token = result.text().trim();
      if (token) {
        return token;
      }
    }
  } catch {
  }

  const ghConfig = await loadGhCliConfig();
  if (ghConfig && host in ghConfig.hosts) {
    return ghConfig.hosts[host].oauthToken ?? null;
  }
  return null;
}

export async function getGhCliHosts(): Promise<string[]> {
  try {
    const result = await $`gh auth status 2>&1`.quiet().nothrow();
    const output = result.text();
    const hosts: string[] = [];
    for (const line of output.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !line.startsWith(" ") && !line.startsWith("\t") && !trimmed.startsWith("✓") && !trimmed.startsWith("X") && !trimmed.startsWith("-")) {
        hosts.push(trimmed);
      }
    }
    if (hosts.length > 0) {
      return hosts;
    }
  } catch {
  }

  const ghConfig = await loadGhCliConfig();
  if (ghConfig) {
    return Object.keys(ghConfig.hosts);
  }
  return [];
}

export function getConfigValue(
  config: ReposConfig,
  keyPath: string
): unknown {
  const keys = keyPath.split(".");
  let value: unknown = config;

  for (const key of keys) {
    if (value && typeof value === "object" && key in value) {
      value = (value as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }

  return value;
}

export function setConfigValue(
  config: ReposConfig,
  keyPath: string,
  value: unknown
): ReposConfig {
  const keys = keyPath.split(".");
  const result = { ...config };

  if (keys.length === 1) {
    (result as Record<string, unknown>)[keys[0]] = value;
  } else if (keys.length === 2 && keys[0] === "github") {
    result.github = {
      ...result.github,
      [keys[1]]: value,
    } as ReposConfig["github"];
  }

  return result;
}

