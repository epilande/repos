import type {
  GitHubRepo,
  RepoOperationResult,
  CloneOptions,
} from "../types.js";
import { directoryExists } from "./repos.js";
import { cloneRepo, pullRepo } from "./git.js";
import { getCloneUrl } from "./github.js";

export type CloneAction = "skip" | "pull" | "clone";

/**
 * Decide which action clone would take for a repo, without performing it.
 * Used by dry-run previews so the interactive and non-TTY paths agree.
 */
export function previewCloneAction(
  exists: boolean,
  skipExisting?: boolean,
): CloneAction {
  if (exists && skipExisting) return "skip";
  return exists ? "pull" : "clone";
}

/**
 * Clone a new repo, pull an existing one, or skip an existing one when
 * skipExisting is set. Shared by the interactive (CloneApp) and non-TTY
 * (ciClone) clone paths so the per-repo decision lives in one place.
 */
export async function cloneOrPullRepo(
  repo: GitHubRepo,
  options: Pick<CloneOptions, "shallow" | "skipExisting">,
): Promise<RepoOperationResult> {
  const exists = await directoryExists(repo.name);

  if (exists && options.skipExisting) {
    return {
      name: repo.name,
      success: true,
      message: "skipped",
      details: "already exists",
    };
  }

  if (exists) {
    const result = await pullRepo(repo.name);
    if (result.success && result.message === "up-to-date") {
      result.message = "already up-to-date";
    } else if (result.success) {
      result.message = "pulled";
    }
    return result;
  }

  return cloneRepo(getCloneUrl(repo), repo.name, { shallow: options.shallow });
}
