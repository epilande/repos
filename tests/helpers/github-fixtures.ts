import type { GitHubRepo } from "../../src/types.js";

/**
 * Build a GitHubRepo fixture for tests. cloneUrl defaults to a placeholder
 * URL; pass a real (e.g. local bare-repo) path when the test actually clones.
 */
export function makeGitHubRepo(
  name: string,
  cloneUrl = `https://example.com/${name}.git`,
): GitHubRepo {
  return {
    name,
    fullName: `test-org/${name}`,
    cloneUrl,
    sshUrl: cloneUrl,
    pushedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archived: false,
  };
}
