import React, { useState, useEffect, useCallback, useRef } from "react";
import { render, Box, Text, useInput, useStdout } from "ink";
import Spinner from "ink-spinner";
import { loadConfig } from "../lib/config.js";
import {
  listRepos,
  filterActiveRepos,
  getCloneUrl,
  getGitHubConfig,
} from "../lib/github.js";
import { cloneRepo, pullRepo } from "../lib/git.js";
import { directoryExists, runParallel } from "../lib/repos.js";
import { ProgressBar } from "../components/ProgressBar.js";
import { ResultList, OperationStats } from "../components/RepoList.js";
import { Confirm } from "../components/Confirm.js";
import { Divider } from "../components/Divider.js";
import type { CloneOptions, GitHubRepo, RepoOperationResult } from "../types.js";

interface CloneAppProps {
  options: CloneOptions;
  onComplete?: () => void;
}

type Phase = "checking" | "fetching" | "cloning" | "cancelling" | "done" | "confirmLiveRun" | "cancelled";

export function CloneApp({ options, onComplete }: CloneAppProps) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [org, setOrg] = useState<string>("");
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [results, setResults] = useState<RepoOperationResult[]>([]);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [activeReposSet, setActiveReposSet] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [startTime, setStartTime] = useState(Date.now());
  const [isDryRun, setIsDryRun] = useState(options.dryRun ?? false);
  const [runKey, setRunKey] = useState(0);
  const cancelledRef = useRef(false);
  const { write } = useStdout();

  useEffect(() => {
    if (!onComplete && (phase === "done" || phase === "cancelled")) {
      setTimeout(() => process.exit(0), 100);
    }
  }, [phase, onComplete]);

  const runCloneOperations = useCallback(async (reposToClone: GitHubRepo[]) => {
    const config = await loadConfig();
    const resultsMap = new Map<number, RepoOperationResult>();
    const currentlyActive = new Set<string>();
    const concurrency = options.parallel ?? config.parallel ?? 10;

    const { results: opResults, cancelled } = await runParallel<RepoOperationResult, GitHubRepo>(
      reposToClone,
      async (repo: GitHubRepo, index: number) => {
        currentlyActive.add(repo.name);
        setActiveReposSet(new Set(currentlyActive));
        
        const targetPath = repo.name;
        const exists = await directoryExists(targetPath);

        let result: RepoOperationResult;

        if (exists) {
          result = await pullRepo(targetPath);
          if (result.success && result.message === "up-to-date") {
            result.message = "already up-to-date";
          } else if (result.success) {
            result.message = "pulled";
          }
        } else {
          const cloneUrl = getCloneUrl(repo);
          result = await cloneRepo(cloneUrl, targetPath, {
            shallow: options.shallow,
          });
        }

        currentlyActive.delete(repo.name);
        setActiveReposSet(new Set(currentlyActive));
        
        resultsMap.set(index, result);
        return result;
      },
      concurrency,
      (completed: number, total: number) => {
        setProgress({ completed, total });
        const resultArray = Array.from(resultsMap.values());
        setResults([...resultArray]);
      },
      () => cancelledRef.current
    );

    setActiveReposSet(new Set());
    setResults(opResults.filter(Boolean));
    setPhase(cancelled ? "cancelled" : "done");
  }, [options.parallel, options.shallow]);

  useEffect(() => {
    if (repos.length > 0 && !isDryRun && phase === "cloning") {
      return;
    }

    async function run() {
      try {
        const config = await loadConfig();
        const ghConfig = await getGitHubConfig();

        const targetOrg = options.org || config.org;
        if (!targetOrg) {
          setError(
            "No organization specified. Use --org flag or run 'repos init' to configure."
          );
          setPhase("done");
          return;
        }
        setOrg(targetOrg);

        const host = options.host || ghConfig.host;

        setPhase("fetching");
        const allRepos = await listRepos(targetOrg, {
          config: { host, apiUrl: ghConfig.apiUrl },
          timeout: config.timeout,
        });

        if (allRepos.length === 0) {
          setError(`No repositories found for ${targetOrg}`);
          setPhase("done");
          return;
        }

        const daysThreshold = options.days ?? config.daysThreshold ?? 90;
        const activeRepos = filterActiveRepos(allRepos, daysThreshold);

        if (activeRepos.length === 0) {
          setError(
            `No active repositories found (activity threshold: ${daysThreshold} days)`
          );
          setPhase("done");
          return;
        }

        setRepos(activeRepos);
        setProgress({ completed: 0, total: activeRepos.length });

        if (isDryRun) {
          const dryRunResults: RepoOperationResult[] = [];
          for (const repo of activeRepos) {
            const exists = await directoryExists(repo.name);
            dryRunResults.push({
              name: repo.name,
              success: true,
              message: exists ? "would pull" : "would clone",
              details: `Last activity: ${repo.pushedAt.slice(0, 10)}`,
            });
          }
          setResults(dryRunResults);
          if (options.interactive) {
            setPhase("confirmLiveRun");
          } else {
            setPhase("done");
          }
          return;
        }

        setPhase("cloning");
        await runCloneOperations(activeRepos);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase("done");
      }
    }

    run();
  }, [options, isDryRun, runKey, runCloneOperations]);

  useEffect(() => {
    if (repos.length > 0 && !isDryRun && phase === "cloning") {
      runCloneOperations(repos).catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setPhase("done");
      });
    }
  }, [repos, isDryRun, phase, runKey, runCloneOperations]);

  const handleProceedWithLiveRun = useCallback(() => {
    write("\x1B[2J\x1B[H");
    cancelledRef.current = false;
    setPhase("cloning");
    setResults([]);
    setProgress({ completed: 0, total: repos.length });
    setError(null);
    setStartTime(Date.now());
    setIsDryRun(false);
    setRunKey((k) => k + 1);
  }, [repos.length, write]);

  const handleCancelLiveRun = useCallback(() => {
    if (onComplete) {
      onComplete();
    } else {
      setPhase("done");
    }
  }, [onComplete]);

  useInput((input, key) => {
    if (key.escape) {
      if (phase === "cloning" || phase === "fetching") {
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
        {!options.org && (
          <Box marginTop={1}>
            <Text dimColor>
              Tip: Run 'repos init' to set up your configuration.
            </Text>
          </Box>
        )}
        {onComplete && (
          <Box marginTop={1}>
            <Text dimColor>⌫/Esc Back</Text>
          </Box>
        )}
      </Box>
    );
  }

  if (phase === "checking") {
    return (
      <Box padding={1}>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Box marginLeft={1}>
          <Text>Checking configuration...</Text>
        </Box>
      </Box>
    );
  }

  if (phase === "fetching") {
    return (
      <Box padding={1}>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Box marginLeft={1}>
          <Text>Fetching repositories from {org}...</Text>
        </Box>
      </Box>
    );
  }

  const cloned = results.filter((r) => r.message === "cloned").length;
  const pulled = results.filter(
    (r) => r.message === "pulled" || r.message === "already up-to-date"
  ).length;
  const failed = results.filter((r) => !r.success).length;
  const duration = Math.round((Date.now() - startTime) / 1000);

  const showingDryRunResults = isDryRun || phase === "confirmLiveRun";

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {showingDryRunResults ? "Clone Preview (Dry Run)" : "Cloning Repositories"}
        </Text>
        <Text dimColor> from {org}</Text>
        {options.shallow && <Text color="yellow"> (shallow)</Text>}
      </Box>

      {(phase === "cloning" || phase === "cancelling") && (
        <>
          <Box marginBottom={1}>
            <ProgressBar
              value={progress.completed}
              total={progress.total}
              label="Progress:"
            />
          </Box>
          {phase === "cancelling" && (
            <Box marginBottom={1}>
              <Text color="yellow">
                <Spinner type="dots" />
              </Text>
              <Box marginLeft={1}>
                <Text color="yellow">Cancelling... waiting for in-progress operations to finish</Text>
              </Box>
            </Box>
          )}
          <Box flexDirection="column" marginBottom={1} height={12}>
            {activeReposSet.size > 0 ? (
              <>
                <Box>
                  <Text dimColor>
                    <Spinner type="dots" />
                  </Text>
                  <Box marginLeft={1}>
                    <Text dimColor>Processing {activeReposSet.size} repo{activeReposSet.size > 1 ? "s" : ""}: </Text>
                  </Box>
                </Box>
                <Box marginLeft={3} flexDirection="column">
                  {Array.from(activeReposSet).slice(0, 10).map((repoName) => (
                    <Text key={repoName} color="cyan">• {repoName}</Text>
                  ))}
                  {activeReposSet.size > 10 && (
                    <Text dimColor>  ...and {activeReposSet.size - 10} more</Text>
                  )}
                </Box>
              </>
            ) : (
              <Box>
                <Text dimColor>
                  <Spinner type="dots" />
                </Text>
                <Box marginLeft={1}>
                  <Text dimColor>Starting...</Text>
                </Box>
              </Box>
            )}
          </Box>
          {phase === "cloning" && (
            <Box marginTop={1}>
              <Text dimColor>Esc Cancel</Text>
            </Box>
          )}
        </>
      )}

      {results.length > 0 && (phase === "done" || phase === "confirmLiveRun" || phase === "cancelled") && (
        <Box flexDirection="column" marginBottom={1}>
          <ResultList results={results} maxShow={50} />
        </Box>
      )}

      {phase === "confirmLiveRun" && (
        <>
          <Box flexDirection="column">
            <Divider width={40} />
            <Box marginTop={1} flexDirection="column">
              <Text bold>Summary:</Text>
              <Text>
                Active repositories: {repos.length} (of{" "}
                {options.days ?? 90} day threshold)
              </Text>
            </Box>
          </Box>

          <Box marginTop={1}>
            <Confirm
              message="Would you like to proceed with the actual clone?"
              onConfirm={handleProceedWithLiveRun}
              onCancel={handleCancelLiveRun}
              defaultValue={true}
            />
          </Box>
        </>
      )}

      {(phase === "done" || phase === "cancelled") && (
        <>
          <Box flexDirection="column">
            <Divider width={40} />
            <Box marginTop={1} flexDirection="column">
              <Text bold>{phase === "cancelled" ? "Cancelled" : "Summary"}:</Text>
              <Text>
                Active repositories: {repos.length} (of{" "}
                {options.days ?? 90} day threshold)
              </Text>
              {!isDryRun && (
                <>
                  <Text color="green">Cloned: {cloned}</Text>
                  <Text color="cyan">Pulled: {pulled}</Text>
                  {failed > 0 && <Text color="red">Failed: {failed}</Text>}
                  {phase === "cancelled" && (
                    <Text color="yellow">Skipped: {repos.length - results.length}</Text>
                  )}
                  <Text dimColor>Duration: {duration}s</Text>
                </>
              )}
            </Box>
          </Box>

          {phase === "cancelled" && (
            <Box marginTop={1}>
              <Text color="yellow">
                Operation cancelled. {results.length} of {repos.length} repositories processed.
              </Text>
            </Box>
          )}

          {isDryRun && phase === "done" && (
            <Box marginTop={1}>
              <Text color="yellow">
                Dry run complete! Run without --dry-run to actually clone.
              </Text>
            </Box>
          )}

          {onComplete && (
            <Box marginTop={1}>
              <Text dimColor>⌫/Esc Back</Text>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

export async function runClone(options: CloneOptions): Promise<void> {
  const { waitUntilExit } = render(<CloneApp options={options} />);
  await waitUntilExit();
}

