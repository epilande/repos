import React, { useState, useEffect, useRef } from "react";
import { render, Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { findRepos, filterRepos } from "../lib/repos.js";
import { fetchRepo } from "../lib/git.js";
import { loadConfig } from "../lib/config.js";
import { ProgressBar } from "../components/ProgressBar.js";
import { Divider } from "../components/Divider.js";
import type { FetchOptions, RepoOperationResult } from "../types.js";

interface FetchAppProps {
  options: FetchOptions;
  onComplete?: () => void;
}

type Phase = "finding" | "fetching" | "cancelling" | "done" | "cancelled";

function getResultIcon(result: RepoOperationResult): { icon: string; color: string } {
  if (result.success) {
    return { icon: "✓", color: "green" };
  }
  return { icon: "✗", color: "red" };
}

function ResultRow({ result }: { result: RepoOperationResult }) {
  const { icon, color } = getResultIcon(result);

  return (
    <Box>
      <Box width={3}>
        <Text color={color}>{icon}</Text>
      </Box>
      <Box width={28}>
        <Text>{result.name.slice(0, 26)}{result.name.length > 26 ? "…" : ""}</Text>
      </Box>
      <Box width={16}>
        <Text color={result.success ? "green" : "red"}>
          {result.message}
        </Text>
      </Box>
      {result.error && (
        <Text dimColor>({result.error})</Text>
      )}
    </Box>
  );
}

function ResultsTable({
  results,
  showAll = false
}: {
  results: RepoOperationResult[];
  showAll?: boolean;
}) {
  const successful = results.filter(r => r.success);
  const errors = results.filter(r => !r.success);

  const maxShow = showAll ? 100 : 8;

  return (
    <Box flexDirection="column">
      {successful.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="green" bold>Fetched ({successful.length}):</Text>
          {showAll ? (
            <>
              {successful.slice(0, maxShow).map(r => (
                <ResultRow key={r.name} result={r} />
              ))}
              {successful.length > maxShow && (
                <Text dimColor>  ... and {successful.length - maxShow} more</Text>
              )}
            </>
          ) : (
            <Text color="green">  {successful.length} repositories fetched successfully</Text>
          )}
        </Box>
      )}

      {errors.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="red" bold>Errors ({errors.length}):</Text>
          {errors.slice(0, maxShow).map(r => (
            <ResultRow key={r.name} result={r} />
          ))}
          {errors.length > maxShow && (
            <Text dimColor>  ... and {errors.length - maxShow} more</Text>
          )}
        </Box>
      )}
    </Box>
  );
}

export function FetchApp({ options, onComplete }: FetchAppProps) {
  const [phase, setPhase] = useState<Phase>("finding");
  const [repos, setRepos] = useState<string[]>([]);
  const [results, setResults] = useState<RepoOperationResult[]>([]);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [startTime] = useState(Date.now());
  const [parallel, setParallel] = useState(10);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!onComplete && (phase === "done" || phase === "cancelled")) {
      setTimeout(() => process.exit(0), 100);
    }
  }, [phase, onComplete]);

  useEffect(() => {
    async function runFetch() {
      try {
        const config = await loadConfig();
        const parallelCount = options.parallel ?? config.parallel ?? 10;
        setParallel(parallelCount);

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
        setPhase("fetching");

        if (options.dryRun) {
          const dryRunResults: RepoOperationResult[] = repoPaths.map(repoPath => ({
            name: repoPath.split("/").pop() || repoPath,
            success: true,
            message: "would fetch",
          }));
          setResults(dryRunResults);
          setProgress({ completed: repoPaths.length, total: repoPaths.length });
          setPhase("done");
          return;
        }

        const allResults: RepoOperationResult[] = [];
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
            const result = await fetchRepo(repoPath, {
              prune: options.prune,
              all: options.all,
            });

            allResults[currentIndex] = result;
            completed++;
            setProgress({ completed, total: repoPaths.length });
            setResults([...allResults.filter(Boolean)]);
          }
        };

        const workers = Array(Math.min(parallelCount, repoPaths.length))
          .fill(null)
          .map(() => processNext());

        await Promise.all(workers);

        setResults(allResults.filter(Boolean));
        setPhase(wasCancelled ? "cancelled" : "done");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase("done");
      }
    }

    runFetch();
  }, [options]);

  useInput((_, key) => {
    if (key.escape) {
      if (phase === "fetching") {
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
      <Box flexDirection="column">
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

  const successful = results.filter(r => r.success).length;
  const errors = results.filter(r => !r.success).length;
  const duration = Math.round((Date.now() - startTime) / 1000);

  const fetchFlags: string[] = [];
  if (options.prune) fetchFlags.push("--prune");
  if (options.all) fetchFlags.push("--all");
  const flagsStr = fetchFlags.length > 0 ? ` (${fetchFlags.join(" ")})` : "";

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {options.dryRun ? "Fetch Check (Dry Run)" : "Fetching Repositories"}
        </Text>
        <Text dimColor> • {repos.length} repos • parallel: {parallel}{flagsStr}</Text>
      </Box>

      {(phase === "fetching" || phase === "cancelling") && (
        <>
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
        </>
      )}

      {(phase === "fetching" || phase === "cancelling") && !options.quiet && results.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Divider marginTop={0} marginBottom={1} />
          <ResultsTable results={results} showAll={false} />
        </Box>
      )}

      {(phase === "done" || phase === "cancelled") && !options.quiet && (
        <ResultsTable results={results} showAll={true} />
      )}

      {(phase === "done" || phase === "cancelled") && (
        <Box flexDirection="column" marginTop={1}>
          <Divider marginTop={0} marginBottom={1} />
          <Box flexDirection="column">
            <Text bold>{phase === "cancelled" ? "Cancelled" : "Summary"}:</Text>
            <Box>
              <Box width={25}>
                <Text>Repositories processed:</Text>
              </Box>
              <Text>{results.length}</Text>
            </Box>
            {successful > 0 && (
              <Box>
                <Box width={25}>
                  <Text color="green">{options.dryRun ? "Would fetch:" : "Fetched:"}</Text>
                </Box>
                <Text color="green">{successful}</Text>
              </Box>
            )}
            {errors > 0 && (
              <Box>
                <Box width={25}>
                  <Text color="red">Errors:</Text>
                </Box>
                <Text color="red">{errors}</Text>
              </Box>
            )}
            {phase === "cancelled" && repos.length - results.length > 0 && (
              <Box>
                <Box width={25}>
                  <Text color="yellow">Not processed:</Text>
                </Box>
                <Text color="yellow">{repos.length - results.length}</Text>
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
      )}

      {phase === "cancelled" && (
        <Box marginTop={1}>
          <Text color="yellow">
            Operation cancelled. {results.length} of {repos.length} repositories processed.
          </Text>
        </Box>
      )}

      {phase === "done" && options.dryRun && (
        <Box marginTop={1}>
          <Text color="cyan">
            Run without --dry-run to actually fetch.
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

export async function runFetch(options: FetchOptions): Promise<void> {
  const { waitUntilExit } = render(<FetchApp options={options} />);
  await waitUntilExit();
}
