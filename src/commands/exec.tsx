import React, { useState, useEffect, useRef } from "react";
import { render, Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { findRepos, filterRepos } from "../lib/repos.js";
import { execInRepo, type ExecResult } from "../lib/git.js";
import { loadConfig } from "../lib/config.js";
import { ProgressBar } from "../components/ProgressBar.js";
import { Divider } from "../components/Divider.js";
import type { ExecOptions } from "../types.js";

interface ExecAppProps {
  options: ExecOptions;
  onComplete?: () => void;
}

type Phase = "finding" | "executing" | "cancelling" | "done" | "cancelled";

function ResultOutput({ result, quiet }: { result: ExecResult; quiet: boolean }) {
  if (quiet && !result.output) {
    return null;
  }

  const statusColor = result.success ? "green" : "red";
  const statusIcon = result.success ? "✓" : "✗";

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={statusColor}>{statusIcon} </Text>
        <Text bold color="cyan">{result.name}</Text>
        {result.exitCode !== 0 && (
          <Text dimColor> (exit code: {result.exitCode})</Text>
        )}
      </Box>
      {result.output && (
        <Box paddingLeft={2}>
          <Text color={result.success ? undefined : "red"}>{result.output}</Text>
        </Box>
      )}
    </Box>
  );
}

export function ExecApp({ options, onComplete }: ExecAppProps) {
  const [phase, setPhase] = useState<Phase>("finding");
  const [repos, setRepos] = useState<string[]>([]);
  const [results, setResults] = useState<ExecResult[]>([]);
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
    async function runExec() {
      try {
        if (!options.command) {
          setError("No command specified");
          setPhase("done");
          return;
        }

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
        setPhase("executing");

        const allResults: ExecResult[] = [];
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
            const result = await execInRepo(repoPath, options.command);

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

    runExec();
  }, [options]);

  useInput((_, key) => {
    if (key.escape) {
      if (phase === "executing") {
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

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const withOutput = results.filter(r => r.output).length;
  const duration = Math.round((Date.now() - startTime) / 1000);

  const displayCmd = options.command
    ? (options.command.length > 40
        ? options.command.slice(0, 37) + "..."
        : options.command)
    : "(no command)";

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Exec: {displayCmd}
        </Text>
        <Text dimColor> • {repos.length} repos • parallel: {parallel}</Text>
      </Box>

      {(phase === "executing" || phase === "cancelling") && (
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

      {(phase === "done" || phase === "cancelled") && (
        <Box flexDirection="column">
          {results.map(r => (
            <ResultOutput key={r.name} result={r} quiet={options.quiet ?? false} />
          ))}
        </Box>
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
                  <Text color="green">Successful:</Text>
                </Box>
                <Text color="green">{successful}</Text>
              </Box>
            )}
            {failed > 0 && (
              <Box>
                <Box width={25}>
                  <Text color="red">Failed:</Text>
                </Box>
                <Text color="red">{failed}</Text>
              </Box>
            )}
            {options.quiet && (
              <Box>
                <Box width={25}>
                  <Text dimColor>With output:</Text>
                </Box>
                <Text dimColor>{withOutput}</Text>
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

      {(phase === "done" || phase === "cancelled") && onComplete && (
        <Box marginTop={1}>
          <Text dimColor>⌫/Esc Back</Text>
        </Box>
      )}
    </Box>
  );
}

export async function runExec(options: ExecOptions): Promise<void> {
  const { waitUntilExit } = render(<ExecApp options={options} />);
  await waitUntilExit();
}
