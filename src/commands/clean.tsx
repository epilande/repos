import React, { useState, useEffect, useCallback, useRef } from "react";
import { render, Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { findRepos, filterRepos, getAllRepoStatuses } from "../lib/repos.js";
import { cleanRepo } from "../lib/git.js";
import { Confirm } from "../components/Confirm.js";
import { ProgressBar } from "../components/ProgressBar.js";
import { RepoList, ResultList, OperationStats } from "../components/RepoList.js";
import { Divider } from "../components/Divider.js";
import type { CleanupOptions, RepoStatus, RepoOperationResult } from "../types.js";

interface CleanAppProps {
  options: CleanupOptions;
  onComplete?: () => void;
}

type Phase = "finding" | "confirming" | "cleaning" | "cancelling" | "done" | "confirmLiveRun" | "cancelled";

export function CleanApp({ options, onComplete }: CleanAppProps) {
  const [phase, setPhase] = useState<Phase>("finding");
  const [dirtyRepos, setDirtyRepos] = useState<RepoStatus[]>([]);
  const [results, setResults] = useState<RepoOperationResult[]>([]);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [startTime, setStartTime] = useState(Date.now());
  const [isDryRun, setIsDryRun] = useState(options.dryRun ?? false);
  const [runKey, setRunKey] = useState(0);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (dirtyRepos.length > 0 && !isDryRun && (phase === "confirming" || phase === "cleaning")) {
      return;
    }

    async function findDirtyRepos() {
      try {
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

        const statuses = await getAllRepoStatuses(repoPaths);

        const dirty = statuses.filter((s) => {
          if (s.modified > 0 || s.staged > 0 || s.deleted > 0) return true;
          if (options.all && s.untracked > 0) return true;
          return false;
        });

        if (dirty.length === 0) {
          setDirtyRepos([]);
          setPhase("done");
          return;
        }

        setDirtyRepos(dirty);

        if (isDryRun) {
          if (options.interactive) {
            setPhase("confirmLiveRun");
          } else {
            setPhase("done");
          }
        } else if (options.force) {
          setPhase("cleaning");
        } else {
          setPhase("confirming");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase("done");
      }
    }

    findDirtyRepos();
  }, [options, isDryRun, runKey, dirtyRepos.length, phase]);

  useEffect(() => {
    if (phase !== "cleaning") return;

    async function runCleanup() {
      const allResults: RepoOperationResult[] = [];
      setProgress({ completed: 0, total: dirtyRepos.length });
      let wasCancelled = false;

      for (let i = 0; i < dirtyRepos.length; i++) {
        if (cancelledRef.current) {
          wasCancelled = true;
          break;
        }
        const repo = dirtyRepos[i];
        const result = await cleanRepo(repo.path, options.all);
        allResults.push(result);
        setProgress({ completed: i + 1, total: dirtyRepos.length });
        setResults([...allResults]);
      }

      setPhase(wasCancelled ? "cancelled" : "done");
    }

    runCleanup();
  }, [phase, dirtyRepos, options.all]);

  const handleConfirm = useCallback(() => {
    cancelledRef.current = false;
    setPhase("cleaning");
  }, []);

  const handleCancel = useCallback(() => {
    if (onComplete) {
      onComplete();
    } else {
      process.exit(0);
    }
  }, [onComplete]);

  const handleProceedWithLiveRun = useCallback(() => {
    cancelledRef.current = false;
    setResults([]);
    setProgress({ completed: 0, total: 0 });
    setError(null);
    setStartTime(Date.now());
    setIsDryRun(false);
    if (options.force) {
      setPhase("cleaning");
    } else {
      setPhase("confirming");
    }
  }, [options.force]);

  const handleCancelLiveRun = useCallback(() => {
    if (onComplete) {
      onComplete();
    } else {
      setPhase("done");
    }
  }, [onComplete]);

  useEffect(() => {
    if (!onComplete && (phase === "done" || phase === "cancelled")) {
      setTimeout(() => process.exit(0), 100);
    }
  }, [phase, onComplete]);

  useInput((input, key) => {
    if (key.escape) {
      if (phase === "cleaning") {
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
          <Text>Finding repositories with changes...</Text>
        </Box>
      </Box>
    );
  }

  if (phase === "done" && dirtyRepos.length === 0 && results.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="green">✓ All repositories are already clean!</Text>
        {onComplete && (
          <Box marginTop={1}>
            <Text dimColor>⌫/Esc Back</Text>
          </Box>
        )}
      </Box>
    );
  }

  const renderDryRunPreview = () => (
    <Box flexDirection="column">
      <Text bold color="yellow">
        Cleanup Preview (Dry Run)
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text color="yellow">
          Would clean {dirtyRepos.length} repositories:
        </Text>
        <Box marginTop={1} paddingLeft={2} flexDirection="column">
          {dirtyRepos.map((repo) => {
            const changes: string[] = [];
            if (repo.modified > 0) changes.push(`${repo.modified} modified`);
            if (repo.staged > 0) changes.push(`${repo.staged} staged`);
            if (repo.deleted > 0) changes.push(`${repo.deleted} deleted`);
            if (options.all && repo.untracked > 0)
              changes.push(`${repo.untracked} untracked`);

            return (
              <Text key={repo.path}>
                <Text color="yellow">•</Text> {repo.name}{" "}
                <Text dimColor>({changes.join(", ")})</Text>
              </Text>
            );
          })}
        </Box>
      </Box>
    </Box>
  );

  if (phase === "confirmLiveRun") {
    return (
      <Box flexDirection="column">
        {renderDryRunPreview()}
        <Box marginTop={1}>
          <Confirm
            message="Would you like to proceed with the actual cleanup?"
            onConfirm={handleProceedWithLiveRun}
            onCancel={handleCancelLiveRun}
            defaultValue={false}
            isDestructive={true}
          />
        </Box>
      </Box>
    );
  }

  if (isDryRun && phase === "done") {
    return (
      <Box flexDirection="column">
        {renderDryRunPreview()}
        <Box marginTop={1}>
          <Text dimColor>
            Run without --dry-run to actually clean these repositories.
          </Text>
        </Box>
      </Box>
    );
  }

  if (phase === "confirming") {
    const repoNames = dirtyRepos.map((r) => r.name);
    const totalChanges = dirtyRepos.reduce(
      (sum, r) =>
        sum + r.modified + r.staged + r.deleted + (options.all ? r.untracked : 0),
      0
    );

    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold color="red">
            ⚠ WARNING: Destructive Operation
          </Text>
        </Box>
        <Text>
          This will {options.all ? "clean" : "revert changes in"}{" "}
          <Text bold>{dirtyRepos.length}</Text> repositories
          {options.all && " (including untracked files)"}:
        </Text>
        <Box marginY={1} paddingLeft={2}>
          <RepoList repos={repoNames} maxShow={10} />
        </Box>
        <Text dimColor>
          Total files affected: ~{totalChanges}
        </Text>
        <Box marginTop={1}>
          <Confirm
            message="Are you sure you want to proceed?"
            onConfirm={handleConfirm}
            onCancel={handleCancel}
            isDestructive={true}
          />
        </Box>
      </Box>
    );
  }

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const duration = Math.round((Date.now() - startTime) / 1000);

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Cleaning Repositories
        </Text>
      </Box>

      {(phase === "cleaning" || phase === "cancelling") && (
        <>
          <Box marginBottom={1}>
            <ProgressBar
              value={progress.completed}
              total={progress.total}
              label="Progress:"
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

      {results.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          {(phase === "cleaning" || phase === "cancelling") && <Divider marginTop={1} marginBottom={1} />}
          <ResultList results={results} maxShow={phase === "done" || phase === "cancelled" || phase === "cancelling" ? 50 : 10} />
        </Box>
      )}

      {(phase === "done" || phase === "cancelled") && (
        <>
          <OperationStats
            total={dirtyRepos.length}
            successful={successful}
            failed={failed}
            skipped={phase === "cancelled" ? dirtyRepos.length - results.length : 0}
            duration={duration}
            operation="cleaned"
          />
          {phase === "cancelled" && (
            <Box marginTop={1}>
              <Text color="yellow">
                Operation cancelled. {results.length} of {dirtyRepos.length} repositories processed.
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

export async function runClean(options: CleanupOptions): Promise<void> {
  const { waitUntilExit } = render(<CleanApp options={options} />);
  await waitUntilExit();
}

