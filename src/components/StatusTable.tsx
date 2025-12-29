import { Box, Text } from "ink";
import type { RepoStatus } from "../types.js";
import { Divider } from "./Divider.js";

interface StatusTableProps {
  repos: RepoStatus[];
  showClean?: boolean;
}

function formatSync(status: RepoStatus): string {
  if (!status.hasUpstream) return "—";
  if (status.ahead === 0 && status.behind === 0) return "✓";

  const parts: string[] = [];
  if (status.ahead > 0) parts.push(`↑${status.ahead}`);
  if (status.behind > 0) parts.push(`↓${status.behind}`);
  return parts.join(" ");
}

function getSyncColor(status: RepoStatus): string | undefined {
  if (!status.hasUpstream) return undefined;
  if (status.ahead === 0 && status.behind === 0) return "green";
  if (status.behind > 0) return "yellow";
  return "cyan";
}

function shouldDimSync(status: RepoStatus): boolean {
  return !status.hasUpstream;
}

function TableHeader() {
  return (
    <Box>
      <Box width={28}>
        <Text bold color="cyan">Repository</Text>
      </Box>
      <Box width={14}>
        <Text bold color="cyan">Branch</Text>
      </Box>
      <Box width={10}>
        <Text bold color="cyan">Modified</Text>
      </Box>
      <Box width={8}>
        <Text bold color="cyan">Staged</Text>
      </Box>
      <Box width={11}>
        <Text bold color="cyan">Untracked</Text>
      </Box>
      <Box width={8}>
        <Text bold color="cyan">Sync</Text>
      </Box>
    </Box>
  );
}

function TableRow({ status }: { status: RepoStatus }) {
  const statusIcon = status.isClean ? (
    <Text color="green">✓</Text>
  ) : (
    <Text color="yellow">●</Text>
  );

  return (
    <Box>
      <Box width={28}>
        <Text>
          {statusIcon} {status.name.slice(0, 25)}
          {status.name.length > 25 ? "…" : ""}
        </Text>
      </Box>
      <Box width={14}>
        <Text color="blue">
          {status.branch.slice(0, 11)}
          {status.branch.length > 11 ? "…" : ""}
        </Text>
      </Box>
      <Box width={10}>
        <Text color={status.modified > 0 ? "yellow" : undefined} dimColor={status.modified === 0}>
          {status.modified}
        </Text>
      </Box>
      <Box width={8}>
        <Text color={status.staged > 0 ? "green" : undefined} dimColor={status.staged === 0}>
          {status.staged}
        </Text>
      </Box>
      <Box width={11}>
        <Text color={status.untracked > 0 ? "blue" : undefined} dimColor={status.untracked === 0}>
          {status.untracked}
        </Text>
      </Box>
      <Box width={8}>
        <Text color={getSyncColor(status)} dimColor={shouldDimSync(status)}>{formatSync(status)}</Text>
      </Box>
    </Box>
  );
}

export function StatusTable({ repos, showClean = true }: StatusTableProps) {
  const filteredRepos = showClean
    ? repos
    : repos.filter((r) => !r.isClean || r.ahead > 0 || r.behind > 0);

  if (filteredRepos.length === 0) {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Text color="green">All repositories are clean!</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <TableHeader />
      <Divider width={77} marginBottom={1} />
      {filteredRepos.map((status) => (
        <TableRow key={status.path} status={status} />
      ))}
    </Box>
  );
}

interface SummaryProps {
  repos: RepoStatus[];
}

export function StatusSummary({ repos }: SummaryProps) {
  const clean = repos.filter((r) => r.isClean).length;
  const dirty = repos.length - clean;
  const modified = repos.reduce((sum, r) => sum + r.modified, 0);
  const staged = repos.reduce((sum, r) => sum + r.staged, 0);
  const untracked = repos.reduce((sum, r) => sum + r.untracked, 0);
  const ahead = repos.filter((r) => r.ahead > 0).length;
  const behind = repos.filter((r) => r.behind > 0).length;

  return (
    <Box flexDirection="column">
      <Divider width={40} />
      <Box marginTop={1} flexDirection="column">
        <Text>
          <Text bold>Total:</Text> {repos.length} repositories
        </Text>
        <Text>
          <Text color="green">Clean:</Text> {clean}
          {"  "}
          <Text color="yellow">With changes:</Text> {dirty}
        </Text>
        {dirty > 0 && (
          <Box paddingLeft={2} flexDirection="column">
            <Text dimColor>
              Modified: {modified} | Staged: {staged} | Untracked: {untracked}
            </Text>
          </Box>
        )}
        {(ahead > 0 || behind > 0) && (
          <Text>
            <Text color="cyan">Ahead:</Text> {ahead} repos{"  "}
            <Text color="yellow">Behind:</Text> {behind} repos
          </Text>
        )}
      </Box>
    </Box>
  );
}

