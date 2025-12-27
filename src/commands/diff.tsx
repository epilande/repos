import React, { useState, useEffect } from "react";
import { render, Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { findRepos, filterRepos } from "../lib/repos.js";
import { diffRepo, type DiffResult } from "../lib/git.js";
import { Divider } from "../components/Divider.js";
import type { DiffOptions } from "../types.js";

interface DiffAppProps {
  options: DiffOptions;
  onComplete?: () => void;
}

type Phase = "finding" | "diffing" | "done";

function DiffOutput({ result, showStat }: { result: DiffResult; showStat: boolean }) {
  const content = showStat ? result.stat : result.diff;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold color="cyan">{result.name}</Text>
      </Box>
      <Box paddingLeft={2}>
        <Text>{content}</Text>
      </Box>
    </Box>
  );
}

export function DiffApp({ options, onComplete }: DiffAppProps) {
  const [phase, setPhase] = useState<Phase>("finding");
  const [repos, setRepos] = useState<string[]>([]);
  const [results, setResults] = useState<DiffResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!onComplete && phase === "done") {
      setTimeout(() => process.exit(0), 100);
    }
  }, [phase, onComplete]);

  useEffect(() => {
    async function runDiff() {
      try {
        let repoPaths = await findRepos();

        if (repoPaths.length === 0) {
          setError("No repositories found in current directory");
          setPhase("done");
          return;
        }

        if (options.filter) {
          repoPaths = filterRepos(repoPaths, options.filter);
          if (repoPaths.length === 0) {
            setError(`No repositories match pattern: ${options.filter}`);
            setPhase("done");
            return;
          }
        }

        setRepos(repoPaths);
        setPhase("diffing");

        const allResults: DiffResult[] = [];

        for (const repoPath of repoPaths) {
          const result = await diffRepo(repoPath);
          if (result.hasDiff) {
            allResults.push(result);
          }
        }

        setResults(allResults);
        setPhase("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase("done");
      }
    }

    runDiff();
  }, [options]);

  useInput((_, key) => {
    if (key.escape && phase === "done" && onComplete) {
      onComplete();
    }
  });

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

  if (phase === "finding") {
    return (
      <Box>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Box marginLeft={1}>
          <Text>Finding repositories...</Text>
        </Box>
      </Box>
    );
  }

  if (phase === "diffing") {
    return (
      <Box>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Box marginLeft={1}>
          <Text>Checking for changes...</Text>
        </Box>
      </Box>
    );
  }

  const reposWithChanges = results.length;
  const cleanRepos = repos.length - reposWithChanges;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Repository Diff
        </Text>
        <Text color="gray"> • {repos.length} repos checked</Text>
      </Box>

      {reposWithChanges === 0 ? (
        <Box marginBottom={1}>
          <Text color="green">✓ All repositories are clean (no uncommitted changes)</Text>
        </Box>
      ) : options.quiet ? (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="yellow">Repositories with changes ({reposWithChanges}):</Text>
          {results.map(r => (
            <Box key={r.name} paddingLeft={2}>
              <Text color="yellow">● </Text>
              <Text>{r.name}</Text>
            </Box>
          ))}
        </Box>
      ) : (
        <Box flexDirection="column">
          {results.map(r => (
            <DiffOutput key={r.name} result={r} showStat={options.stat ?? false} />
          ))}
        </Box>
      )}

      <Box flexDirection="column" marginTop={1}>
        <Divider marginTop={0} marginBottom={1} />
        <Box flexDirection="column">
          <Text bold>Summary:</Text>
          <Box>
            <Box width={25}>
              <Text>Repositories checked:</Text>
            </Box>
            <Text>{repos.length}</Text>
          </Box>
          {reposWithChanges > 0 && (
            <Box>
              <Box width={25}>
                <Text color="yellow">With changes:</Text>
              </Box>
              <Text color="yellow">{reposWithChanges}</Text>
            </Box>
          )}
          <Box>
            <Box width={25}>
              <Text color="green">Clean:</Text>
            </Box>
            <Text color="green">{cleanRepos}</Text>
          </Box>
        </Box>
      </Box>

      {onComplete && (
        <Box marginTop={1}>
          <Text color="gray">Press Escape to return to menu</Text>
        </Box>
      )}
    </Box>
  );
}

export async function runDiff(options: DiffOptions): Promise<void> {
  const { waitUntilExit } = render(<DiffApp options={options} />);
  await waitUntilExit();
}
