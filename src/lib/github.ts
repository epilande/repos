import { $ } from "bun";
import type { GitHubRepo, GitHubConfig } from "../types.js";
import { DEFAULT_CONFIG } from "../types.js";
import {
  loadConfig,
  getGhCliToken,
  isGhCliConfigured,
  getGhCliHosts,
} from "./config.js";

export class TimeoutError extends Error {
  constructor(message: string = "Request timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}

export class ConnectionError extends Error {
  constructor(message: string = "Connection failed") {
    super(message);
    this.name = "ConnectionError";
  }
}

const DEFAULT_GITHUB_CONFIG: GitHubConfig = {
  host: "github.com",
  apiUrl: "https://api.github.com",
};

export function getApiUrl(host: string): string {
  if (host === "github.com") {
    return "https://api.github.com";
  }
  // GitHub Enterprise uses /api/v3 path
  return `https://${host}/api/v3`;
}

export async function getGitHubConfig(): Promise<GitHubConfig> {
  const config = await loadConfig();
  if (config.github) {
    return {
      host: config.github.host || DEFAULT_GITHUB_CONFIG.host,
      apiUrl:
        config.github.apiUrl || getApiUrl(config.github.host || "github.com"),
    };
  }
  return DEFAULT_GITHUB_CONFIG;
}

export async function getAuthToken(
  host: string = "github.com",
): Promise<string | null> {
  const ghToken = await getGhCliToken(host);
  if (ghToken) {
    return ghToken;
  }

  if (host === "github.com") {
    return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null;
  }

  return process.env.GH_ENTERPRISE_TOKEN || process.env.GITHUB_TOKEN || null;
}

export async function hasAuth(host: string = "github.com"): Promise<boolean> {
  const token = await getAuthToken(host);
  return token !== null;
}

async function githubFetch<T>(
  endpoint: string,
  config: GitHubConfig,
  options: RequestInit = {},
  timeout?: number,
): Promise<T> {
  const token = await getAuthToken(config.host);
  const url = `${config.apiUrl}${endpoint}`;
  const timeoutMs = timeout ?? DEFAULT_CONFIG.timeout;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "repos",
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub API error (${response.status}): ${error}`);
    }

    return response.json() as Promise<T>;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        throw new TimeoutError(
          `Request to ${config.host} timed out after ${Math.round(timeoutMs / 1000)}s`,
        );
      }
      if (
        error.message.includes("fetch failed") ||
        error.message.includes("ENOTFOUND") ||
        error.message.includes("ECONNREFUSED") ||
        error.message.includes("ETIMEDOUT") ||
        error.message.includes("ENETUNREACH") ||
        error.message.includes("EAI_AGAIN")
      ) {
        throw new ConnectionError(`Unable to connect to ${config.host}`);
      }
    }

    throw error;
  }
}

interface GitHubApiRepo {
  name: string;
  full_name: string;
  clone_url: string;
  ssh_url: string;
  pushed_at: string;
  updated_at: string;
  archived: boolean;
  default_branch: string;
}

function toGitHubRepo(repo: GitHubApiRepo): GitHubRepo {
  return {
    name: repo.name,
    fullName: repo.full_name,
    cloneUrl: repo.clone_url,
    sshUrl: repo.ssh_url,
    pushedAt: repo.pushed_at,
    updatedAt: repo.updated_at,
    archived: repo.archived,
  };
}

export interface ListReposOptions {
  config?: GitHubConfig;
  timeout?: number;
}

export async function listOrgRepos(
  org: string,
  options?: ListReposOptions | GitHubConfig,
): Promise<GitHubRepo[]> {
  const opts: ListReposOptions =
    options && "host" in options ? { config: options } : (options ?? {});
  const ghConfig = opts.config || (await getGitHubConfig());
  const repos: GitHubRepo[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const response = await githubFetch<GitHubApiRepo[]>(
      `/orgs/${org}/repos?per_page=${perPage}&page=${page}&type=all`,
      ghConfig,
      {},
      opts.timeout,
    );

    if (response.length === 0) break;

    repos.push(...response.map(toGitHubRepo));

    if (response.length < perPage) break;
    page++;
  }

  return repos;
}

export async function listUserRepos(
  username: string,
  options?: ListReposOptions | GitHubConfig,
): Promise<GitHubRepo[]> {
  const opts: ListReposOptions =
    options && "host" in options ? { config: options } : (options ?? {});
  const ghConfig = opts.config || (await getGitHubConfig());
  const repos: GitHubRepo[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const response = await githubFetch<GitHubApiRepo[]>(
      `/users/${username}/repos?per_page=${perPage}&page=${page}&type=owner`,
      ghConfig,
      {},
      opts.timeout,
    );

    if (response.length === 0) break;

    repos.push(...response.map(toGitHubRepo));

    if (response.length < perPage) break;
    page++;
  }

  return repos;
}

export async function listRepos(
  orgOrUser: string,
  options?: ListReposOptions | GitHubConfig,
): Promise<GitHubRepo[]> {
  const opts: ListReposOptions =
    options && "host" in options ? { config: options } : (options ?? {});
  const ghConfig = opts.config || (await getGitHubConfig());

  try {
    return await listOrgRepos(orgOrUser, { config: ghConfig, timeout: opts.timeout });
  } catch (error) {
    if (error instanceof TimeoutError || error instanceof ConnectionError) {
      throw error;
    }
    return await listUserRepos(orgOrUser, { config: ghConfig, timeout: opts.timeout });
  }
}

export function filterActiveRepos(
  repos: GitHubRepo[],
  daysThreshold: number,
): GitHubRepo[] {
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - daysThreshold);

  return repos.filter((repo) => {
    if (repo.archived) return false;

    const pushedDate = new Date(repo.pushedAt);
    const updatedDate = new Date(repo.updatedAt);
    const lastActivity = pushedDate > updatedDate ? pushedDate : updatedDate;

    return lastActivity >= thresholdDate;
  });
}

export async function checkGhCli(): Promise<{
  available: boolean;
  authenticated: boolean;
  hosts: string[];
}> {
  try {
    const result = await $`which gh`.quiet();
    if (result.exitCode !== 0) {
      return { available: false, authenticated: false, hosts: [] };
    }
  } catch {
    return { available: false, authenticated: false, hosts: [] };
  }

  const hosts = await getGhCliHosts();
  const authenticated = hosts.length > 0;

  return { available: true, authenticated, hosts };
}

export function getCloneUrl(
  repo: GitHubRepo,
  preferSsh: boolean = false,
): string {
  return preferSsh ? repo.sshUrl : repo.cloneUrl;
}

export async function detectGitHubHost(): Promise<string | null> {
  try {
    const result = await $`find . -maxdepth 2 -name .git -type d`.quiet();
    const gitDirs = result.text().trim().split("\n").filter(Boolean);

    for (const gitDir of gitDirs.slice(0, 5)) {
      const repoPath = gitDir.replace("/.git", "");
      const remoteResult =
        await $`git -C ${repoPath} remote get-url origin`.quiet();

      if (remoteResult.exitCode === 0) {
        const url = remoteResult.text().trim();
        const sshMatch = url.match(/git@([^:]+):/);
        if (sshMatch) return sshMatch[1];

        const httpsMatch = url.match(/https?:\/\/([^/]+)/);
        if (httpsMatch) return httpsMatch[1];
      }
    }
  } catch {
  }

  return null;
}

export { isGhCliConfigured, getGhCliHosts };
