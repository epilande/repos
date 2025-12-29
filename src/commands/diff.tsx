import React, { useState, useEffect, useRef } from "react";
import { render, Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { findRepos, filterRepos } from "../lib/repos.js";
import { diffRepo, type DiffResult } from "../lib/git.js";
import { loadConfig } from "../lib/config.js";
import { ProgressBar } from "../components/ProgressBar.js";
import { Divider } from "../components/Divider.js";
import { DiffHighlight } from "../components/DiffHighlight.js";
import { DEFAULT_CONFIG, type DiffOptions } from "../types.js";

interface DiffAppProps {
  options: DiffOptions;
  onComplete?: () => void;
}

type Phase = "finding" | "diffing" | "cancelling" | "done" | "cancelled";

function DiffOutput({ result, showStat, maxLines }: { result: DiffResult; showStat: boolean; maxLines?: number }) {
  const content = showStat ? result.stat : result.diff;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold color="cyan">{result.name}</Text>
      </Box>
      <Box paddingLeft={2}>
        <DiffHighlight content={content} maxLines={maxLines} />
      </Box>
    </Box>
  );
}

export function DiffApp({ options, onComplete }: DiffAppProps) {
  const [phase, setPhase] = useState<Phase>("finding");
  const [repos, setRepos] = useState<string[]>([]);
  const [results, setResults] = useState<DiffResult[]>([]);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [startTime] = useState(Date.now());
  const [parallel, setParallel] = useState(10);
  const [maxLines, setMaxLines] = useState<number | undefined>(undefined);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!onComplete && (phase === "done" || phase === "cancelled")) {
      setTimeout(() => process.exit(0), 100);
    }
  }, [phase, onComplete]);

  useEffect(() => {
    async function runDiff() {
      try {
        const config = await loadConfig();
        const parallelCount = options.parallel ?? config.parallel ?? DEFAULT_CONFIG.parallel;
        setParallel(parallelCount);

        const configuredMaxLines = options.maxLines ?? config.diffMaxLines ?? DEFAULT_CONFIG.diffMaxLines;
        setMaxLines(configuredMaxLines === 0 ? undefined : configuredMaxLines);

        let repoPaths = await findRepos(options.basePath);

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
        setProgress({ completed: 0, total: repoPaths.length });
        setPhase("diffing");

        const allResults: (DiffResult | null)[] = [];
        let completed = 0;
        let index = 0;
        let wasCancelled = false;

        const processNext = async (): Promise<void> => {
          while (index < repoPaths.length) {
            if (cancelledRef.current) {
              wasCancelled = true;
              return;
            }
            const currentIndex = index++;
            const repoPath = repoPaths[currentIndex];
            const result = await diffRepo(repoPath);

            allResults[currentIndex] = result.hasDiff ? result : null;
            completed++;
            setProgress({ completed, total: repoPaths.length });
            setResults([...allResults.filter((r): r is DiffResult => r !== null)]);
          }
        };

        const workers = Array(Math.min(parallelCount, repoPaths.length))
          .fill(null)
          .map(() => processNext());

        await Promise.all(workers);

        setResults(allResults.filter((r): r is DiffResult => r !== null));
        setPhase(wasCancelled ? "cancelled" : "done");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase("done");
      }
    }

    runDiff();
  }, [options]);

  useInput((_, key) => {
    if (key.escape) {
      if (phase === "diffing") {
        cancelledRef.current = true;
        setPhase("cancelling");
      } else if ((phase === "done" || phase === "cancelled") && onComplete) {
        onComplete();
      }
    } else if (key.delete && (phase === "done" || phase === "cancelled") && onComplete) {
      onComplete();
    }
  });

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {error}</Text>
        {onComplete && (
          <Box marginTop={1}>
            <Text dimColor>⌫/Esc Back</Text>
          </Box>
        )}
      </Box>
    );
  }

  if (phase === "finding") {
    return (
      <Box padding={1}>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Box marginLeft={1}>
          <Text>Finding repositories...</Text>
        </Box>
      </Box>
    );
  }

  const duration = Math.round((Date.now() - startTime) / 1000);

  if (phase === "diffing" || phase === "cancelling") {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Repository Diff
          </Text>
          <Text dimColor> • {repos.length} repos • parallel: {parallel}</Text>
        </Box>

        <Box marginBottom={1}>
          <ProgressBar
            value={progress.completed}
            total={progress.total}
            width={40}
          />
        </Box>

        {phase === "cancelling" ? (
          <Box marginTop={1}>
            <Text color="yellow">
              <Spinner type="dots" />
            </Text>
            <Box marginLeft={1}>
              <Text color="yellow">Cancelling... waiting for in-progress operations to finish</Text>
            </Box>
          </Box>
        ) : (
          <Box marginTop={1}>
            <Text dimColor>Esc Cancel</Text>
          </Box>
        )}
      </Box>
    );
  }

  const reposWithChanges = results.length;
  const reposProcessed = phase === "cancelled" ? progress.completed : repos.length;
  const cleanRepos = reposProcessed - reposWithChanges;

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Repository Diff
        </Text>
        <Text dimColor> • {repos.length} repos • parallel: {parallel}</Text>
      </Box>

      {reposWithChanges === 0 && phase !== "cancelled" ? (
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
            <DiffOutput key={r.name} result={r} showStat={options.stat ?? false} maxLines={maxLines} />
          ))}
        </Box>
      )}

      <Box flexDirection="column" marginTop={1}>
        <Divider marginTop={0} marginBottom={1} />
        <Box flexDirection="column">
          <Text bold>{phase === "cancelled" ? "Cancelled" : "Summary"}:</Text>
          <Box>
            <Box width={25}>
              <Text>Repositories checked:</Text>
            </Box>
            <Text>{reposProcessed}</Text>
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
          {phase === "cancelled" && repos.length - reposProcessed > 0 && (
            <Box>
              <Box width={25}>
                <Text color="yellow">Not processed:</Text>
              </Box>
              <Text color="yellow">{repos.length - reposProcessed}</Text>
            </Box>
          )}
          <Box>
            <Box width={25}>
              <Text dimColor>Duration:</Text>
            </Box>
            <Text dimColor>{duration}s</Text>
          </Box>
        </Box>
      </Box>

      {phase === "cancelled" && (
        <Box marginTop={1}>
          <Text color="yellow">
            Operation cancelled. {reposProcessed} of {repos.length} repositories checked.
          </Text>
        </Box>
      )}

      {(phase === "done" || phase === "cancelled") && onComplete && (
        <Box marginTop={1}>
          <Text dimColor>⌫/Esc Back</Text>
        </Box>
      )}
    </Box>
  );
}

export async function runDiff(options: DiffOptions): Promise<void> {
  const { waitUntilExit } = render(<DiffApp options={options} />);
  await waitUntilExit();
}
