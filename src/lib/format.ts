import type { RepoStatus } from "../types.js";

export function formatSync(status: RepoStatus): string {
  if (!status.hasUpstream) return "—";
  if (status.ahead === 0 && status.behind === 0) return "✓";
  const parts: string[] = [];
  if (status.ahead > 0) parts.push(`↑${status.ahead}`);
  if (status.behind > 0) parts.push(`↓${status.behind}`);
  return parts.join(" ");
}
