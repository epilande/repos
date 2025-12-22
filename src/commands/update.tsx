import React, { useState, useEffect, useCallback, useRef } from "react";
import { render, Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { findRepos, filterRepos } from "../lib/repos.js";
import { pullRepo, fetchRepo, getRepoStatus } from "../lib/git.js";
import { loadConfig } from "../lib/config.js";
import { ProgressBar } from "../components/ProgressBar.js";
import { Confirm } from "../components/Confirm.js";
import { Divider } from "../components/Divider.js";
import type { UpdateOptions, RepoOperationResult } from "../types.js";

interface UpdateAppProps {
  options: UpdateOptions;
  onComplete?: () => void;
}

type Phase = "finding" | "updating" | "cancelling" | "done" | "confirmLiveRun" | "cancelled";

function getResultIcon(result: RepoOperationResult): { icon: string; color: string } {
  if (result.success) {
    if (result.message === "updated" || result.message === "would update") {
      return { icon: "↓", color: "green" };
    }
    return { icon: "✓", color: "green" };
  }
  if (result.message === "skipped") {
    return { icon: "⚠", color: "yellow" };
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
        <Text color={result.success ? "green" : "yellow"}>
          {result.message}
        </Text>
      </Box>
      {result.details && (
        <Text color="gray">({result.details})</Text>
      )}
      {result.error && (
        <Text color="gray">({result.error})</Text>
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
  const updated = results.filter(r => r.success && (r.message === "updated" || r.message === "would update"));
  const upToDate = results.filter(r => r.success && r.message === "up-to-date");
  const skipped = results.filter(r => r.message === "skipped");
  const errors = results.filter(r => !r.success && r.message !== "skipped");

  const maxShow = showAll ? 100 : 8;

  return (
    <Box flexDirection="column">
      {/* Updated repos */}
      {updated.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="green" bold>Updated ({updated.length}):</Text>
          {updated.slice(0, maxShow).map(r => (
            <ResultRow key={r.name} result={r} />
          ))}
          {updated.length > maxShow && (
            <Text color="gray">  ... and {updated.length - maxShow} more</Text>
          )}
        </Box>
      )}

      {/* Up to date repos (collapsed unless showAll) */}
      {upToDate.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="green">
            Already up-to-date: {upToDate.length} repos
          </Text>
          {showAll && upToDate.slice(0, 20).map(r => (
            <ResultRow key={r.name} result={r} />
          ))}
          {showAll && upToDate.length > 20 && (
            <Text color="gray">  ... and {upToDate.length - 20} more</Text>
          )}
        </Box>
      )}

      {/* Skipped repos */}
      {skipped.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="yellow" bold>Skipped ({skipped.length}):</Text>
          {skipped.slice(0, maxShow).map(r => (
            <ResultRow key={r.name} result={r} />
          ))}
          {skipped.length > maxShow && (
            <Text color="gray">  ... and {skipped.length - maxShow} more</Text>
          )}
        </Box>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="red" bold>Errors ({errors.length}):</Text>
          {errors.slice(0, maxShow).map(r => (
            <ResultRow key={r.name} result={r} />
          ))}
          {errors.length > maxShow && (
            <Text color="gray">  ... and {errors.length - maxShow} more</Text>
          )}
        </Box>
      )}
    </Box>
  );
}

export function UpdateApp({ options, onComplete }: UpdateAppProps) {
  const [phase, setPhase] = useState<Phase>("finding");
  const [repos, setRepos] = useState<string[]>([]);
  const [results, setResults] = useState<RepoOperationResult[]>([]);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [startTime, setStartTime] = useState(Date.now());
  const [parallel, setParallel] = useState(10);
  const [isDryRun, setIsDryRun] = useState(options.dryRun ?? false);
  const [runKey, setRunKey] = useState(0);
  const [reposToUpdate, setReposToUpdate] = useState<string[]>([]);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!onComplete && (phase === "done" || phase === "cancelled")) {
      setTimeout(() => process.exit(0), 100);
    }
  }, [phase, onComplete]);

  const runUpdateOperations = useCallback(async (repoPaths: string[], parallelCount: number) => {
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
        const result = await pullRepo(repoPath);

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
  }, []);

  useEffect(() => {
    if (repos.length > 0 && !isDryRun && phase === "updating") {
      return;
    }

    async function runUpdate() {
      try {
        const config = await loadConfig();
        const parallelCount = options.parallel ?? config.parallel ?? 10;
        setParallel(parallelCount);

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
        setProgress({ completed: 0, total: repoPaths.length });
        setPhase("updating");

        if (isDryRun) {
          const allResults: RepoOperationResult[] = [];
          const needsUpdate: string[] = [];
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
              const name = repoPath.split("/").pop() || repoPath;

              await fetchRepo(repoPath);
              const status = await getRepoStatus(repoPath);

              let result: RepoOperationResult;

              if (status.modified > 0 || status.staged > 0) {
                result = {
                  name,
                  success: false,
                  message: "skipped",
                  error: "Has uncommitted changes",
                };
              } else if (!status.hasUpstream) {
                result = {
                  name,
                  success: false,
                  message: "skipped",
                  error: "No upstream configured",
                };
              } else if (status.behind > 0) {
                result = {
                  name,
                  success: true,
                  message: "would update",
                  details: `${status.behind} commit(s) behind`,
                };
                needsUpdate.push(repoPath);
              } else {
                result = {
                  name,
                  success: true,
                  message: "up-to-date",
                };
              }

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
          setReposToUpdate(needsUpdate);

          if (wasCancelled) {
            setPhase("cancelled");
            return;
          }

          if (options.interactive && needsUpdate.length > 0) {
            setPhase("confirmLiveRun");
          } else {
            setPhase("done");
          }
        } else {
          await runUpdateOperations(repoPaths, parallelCount);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase("done");
      }
    }

    runUpdate();
  }, [options, isDryRun, runKey, runUpdateOperations]);

  useEffect(() => {
    if (reposToUpdate.length > 0 && !isDryRun && phase === "updating") {
      setProgress({ completed: 0, total: reposToUpdate.length });
      runUpdateOperations(reposToUpdate, parallel).catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setPhase("done");
      });
    }
  }, [reposToUpdate, isDryRun, phase, runKey, parallel, runUpdateOperations]);

  const handleProceedWithLiveRun = useCallback(() => {
    cancelledRef.current = false;
    setPhase("updating");
    setResults([]);
    setProgress({ completed: 0, total: reposToUpdate.length });
    setError(null);
    setStartTime(Date.now());
    setIsDryRun(false);
    setRunKey((k) => k + 1);
  }, [reposToUpdate.length]);

  const handleCancelLiveRun = useCallback(() => {
    if (onComplete) {
      onComplete();
    } else {
      setPhase("done");
    }
  }, [onComplete]);

  useInput((input, key) => {
    if (key.escape) {
      if (phase === "updating") {
        cancelledRef.current = true;
        setPhase("cancelling");
      } else if ((phase === "done" || phase === "cancelled") && onComplete) {
        onComplete();
      }
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

  const updated = results.filter(r => r.success && (r.message === "updated" || r.message === "would update")).length;
  const upToDate = results.filter(r => r.success && r.message === "up-to-date").length;
  const skipped = results.filter(r => r.message === "skipped").length;
  const errors = results.filter(r => !r.success && r.message !== "skipped").length;
  const duration = Math.round((Date.now() - startTime) / 1000);

  const showingDryRunResults = isDryRun || phase === "confirmLiveRun";

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {showingDryRunResults ? "Update Check (Dry Run)" : "Updating Repositories"}
        </Text>
        <Text color="gray"> • {repos.length} repos • parallel: {parallel}</Text>
      </Box>

      {(phase === "updating" || phase === "cancelling") && (
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
              <Text color="gray">Press Escape to cancel</Text>
            </Box>
          )}
        </>
      )}

      {(phase === "updating" || phase === "cancelling") && !options.quiet && results.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Divider marginTop={0} marginBottom={1} />
          <ResultsTable results={results} showAll={false} />
        </Box>
      )}

      {(phase === "done" || phase === "confirmLiveRun" || phase === "cancelled") && !options.quiet && (
        <ResultsTable results={results} showAll={true} />
      )}

      {phase === "confirmLiveRun" && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray">{"─".repeat(50)}</Text>
          <Box marginTop={1} flexDirection="column">
            <Text bold>Summary:</Text>
            <Box>
              <Box width={25}>
                <Text>Repositories processed:</Text>
              </Box>
              <Text>{repos.length}</Text>
            </Box>
            {updated > 0 && (
              <Box>
                <Box width={25}>
                  <Text color="green">Would update:</Text>
                </Box>
                <Text color="green">{updated}</Text>
              </Box>
            )}
            <Box>
              <Box width={25}>
                <Text>Already up-to-date:</Text>
              </Box>
              <Text>{upToDate}</Text>
            </Box>
            {skipped > 0 && (
              <Box>
                <Box width={25}>
                  <Text color="yellow">Skipped:</Text>
                </Box>
                <Text color="yellow">{skipped}</Text>
              </Box>
            )}
          </Box>
          <Box marginTop={1}>
            <Confirm
              message="Would you like to proceed with the actual update?"
              onConfirm={handleProceedWithLiveRun}
              onCancel={handleCancelLiveRun}
              defaultValue={true}
            />
          </Box>
        </Box>
      )}

      {/* Summary */}
      {(phase === "done" || phase === "cancelled") && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray">{"─".repeat(50)}</Text>
          <Box marginTop={1} flexDirection="column">
            <Text bold>{phase === "cancelled" ? "Cancelled" : "Summary"}:</Text>
            <Box>
              <Box width={25}>
                <Text>Repositories processed:</Text>
              </Box>
              <Text>{results.length}</Text>
            </Box>
            {updated > 0 && (
              <Box>
                <Box width={25}>
                  <Text color="green">{isDryRun ? "Would update:" : "Updated:"}</Text>
                </Box>
                <Text color="green">{updated}</Text>
              </Box>
            )}
            <Box>
              <Box width={25}>
                <Text>Already up-to-date:</Text>
              </Box>
              <Text>{upToDate}</Text>
            </Box>
            {skipped > 0 && (
              <Box>
                <Box width={25}>
                  <Text color="yellow">Skipped:</Text>
                </Box>
                <Text color="yellow">{skipped}</Text>
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
                <Text color="gray">Duration:</Text>
              </Box>
              <Text color="gray">{duration}s</Text>
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

      {phase === "done" && isDryRun && (
        <Box marginTop={1}>
          <Text color={updated > 0 ? "yellow" : "green"}>
            {updated > 0
              ? "Run without --dry-run to actually update."
              : "✓ All repositories are already up-to-date!"}
          </Text>
        </Box>
      )}

      {(phase === "done" || phase === "cancelled") && onComplete && (
        <Box marginTop={1}>
          <Text color="gray">Press Escape to return to menu</Text>
        </Box>
      )}
    </Box>
  );
}

export async function runUpdate(options: UpdateOptions): Promise<void> {
  const { waitUntilExit } = render(<UpdateApp options={options} />);
  await waitUntilExit();
}
