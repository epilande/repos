import { Box, Text } from "ink";
import type { RepoOperationResult } from "../types.js";
import { Divider } from "./Divider.js";

interface RepoListProps {
  repos: string[];
  maxShow?: number;
}

export function RepoList({ repos, maxShow = 10 }: RepoListProps) {
  const showRepos = repos.slice(0, maxShow);
  const remaining = repos.length - maxShow;

  return (
    <Box flexDirection="column">
      {showRepos.map((repo) => (
        <Text key={repo} color="yellow">
          • {repo}
        </Text>
      ))}
      {remaining > 0 && (
        <Text dimColor>... and {remaining} more</Text>
      )}
    </Box>
  );
}

interface ResultListProps {
  results: RepoOperationResult[];
  showOnly?: ("success" | "error" | "skipped")[];
  maxShow?: number;
}

function getResultStyle(result: RepoOperationResult): {
  icon: string;
  color: string;
} {
  if (result.success) {
    return { icon: "✓", color: "green" };
  }
  if (result.message === "skipped") {
    return { icon: "⚠", color: "yellow" };
  }
  return { icon: "✗", color: "red" };
}

export function ResultList({
  results,
  showOnly,
  maxShow = 50,
}: ResultListProps) {
  let filteredResults = results;

  if (showOnly) {
    filteredResults = results.filter((r) => {
      if (showOnly.includes("success") && r.success) return true;
      if (showOnly.includes("error") && !r.success && r.message !== "skipped")
        return true;
      if (showOnly.includes("skipped") && r.message === "skipped") return true;
      return false;
    });
  }

  const showResults = filteredResults.slice(0, maxShow);
  const remaining = filteredResults.length - maxShow;

  return (
    <Box flexDirection="column">
      {showResults.map((result) => {
        const { icon, color } = getResultStyle(result);
        return (
          <Box key={result.name} flexDirection="column">
            <Box>
              <Text color={color}>{icon}</Text>
              <Box marginLeft={1}>
                <Text>{result.name}</Text>
              </Box>
              <Box marginLeft={1}>
                <Text dimColor>
                  - {result.message}
                  {result.details && ` (${result.details})`}
                </Text>
              </Box>
            </Box>
            {result.error && (
              <Box marginLeft={3}>
                <Text color="red" dimColor>
                  {result.error}
                </Text>
              </Box>
            )}
          </Box>
        );
      })}
      {remaining > 0 && (
        <Text dimColor>... and {remaining} more</Text>
      )}
    </Box>
  );
}

interface OperationStatsProps {
  total: number;
  successful: number;
  failed: number;
  skipped: number;
  duration?: number;
  operation: string;
}

export function OperationStats({
  total,
  successful,
  failed,
  skipped,
  duration,
  operation,
}: OperationStatsProps) {
  return (
    <Box flexDirection="column">
      <Divider width={40} />
      <Box marginTop={1} flexDirection="column">
        <Text bold>Summary:</Text>
        <Text>
          Repositories {operation}: {total}
        </Text>
        <Text color="green">Successful: {successful}</Text>
        {skipped > 0 && <Text color="yellow">Skipped: {skipped}</Text>}
        {failed > 0 && <Text color="red">Failed: {failed}</Text>}
        {duration !== undefined && (
          <Text dimColor>Duration: {duration}s</Text>
        )}
      </Box>
    </Box>
  );
}

