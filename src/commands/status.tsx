import React, { useState, useEffect, useRef } from "react";
import { render, Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { findRepos, filterRepos, runParallel } from "../lib/repos.js";
import { fetchRepo, getRepoStatus } from "../lib/git.js";
import { loadConfig } from "../lib/config.js";
import { StatusTable, StatusSummary } from "../components/StatusTable.js";
import { ProgressBar } from "../components/ProgressBar.js";
import { Divider } from "../components/Divider.js";
import { Summary, SummaryRow, ReturnHint } from "../components/Summary.js";
import type { StatusOptions, RepoStatus, RepoOperationResult } from "../types.js";

type Phase = "finding" | "fetching" | "checking" | "cancelling" | "done" | "cancelled";

function ErrorRow({ result }: { result: RepoOperationResult }) {
  return (
    <Box>
      <Box width={3}>
        <Text color="red">✗</Text>
      </Box>
      <Box width={28}>
        <Text>{result.name.slice(0, 26)}{result.name.length > 26 ? "…" : ""}</Text>
      </Box>
      <Box width={16}>
        <Text color="red">error</Text>
      </Box>
      {result.error && (
        <Text color="gray">({result.error})</Text>
      )}
    </Box>
  );
}

function ErrorsTable({ 
  errors, 
  maxShow = 8 
}: { 
  errors: RepoOperationResult[];
  maxShow?: number;
}) {
  if (errors.length === 0) return null;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="red" bold>Errors ({errors.length}):</Text>
      {errors.slice(0, maxShow).map(r => (
        <ErrorRow key={r.name} result={r} />
      ))}
      {errors.length > maxShow && (
        <Text color="gray">  ... and {errors.length - maxShow} more</Text>
      )}
    </Box>
  );
}

interface StatusAppProps {
  options: StatusOptions;
  onComplete?: () => void;
}

export function StatusApp({ options, onComplete }: StatusAppProps) {
  const [phase, setPhase] = useState<Phase>("finding");
  const [repos, setRepos] = useState<RepoStatus[]>([]);
  const [repoCount, setRepoCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [fetchErrors, setFetchErrors] = useState<RepoOperationResult[]>([]);
  const [parallel, setParallel] = useState(10);
  const [startTime, setStartTime] = useState(Date.now());
  const cancelledRef = useRef(false);

  useEffect(() => {
    async function loadStatus() {
      try {
        setStartTime(Date.now());

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

        const config = await loadConfig();
        const concurrency = config.parallel ?? 10;
        setParallel(concurrency);
        setRepoCount(repoPaths.length);
        setProgress({ completed: 0, total: repoPaths.length });

        if (options.fetch) {
          setPhase("fetching");
          const errors: RepoOperationResult[] = [];
          
          const { cancelled } = await runParallel(
            repoPaths,
            async (repoPath) => {
              const result = await fetchRepo(repoPath);
              if (!result.success) {
                errors.push(result);
                setFetchErrors([...errors]);
              }
              return result;
            },
            concurrency,
            (completed, total) => setProgress({ completed, total }),
            () => cancelledRef.current
          );
          
          if (cancelled) {
            setPhase("cancelled");
            return;
          }
        }

        setPhase("checking");
        setProgress({ completed: 0, total: repoPaths.length });
        
        const { results: statuses, cancelled: statusCancelled } = await runParallel(
          repoPaths,
          async (repoPath) => getRepoStatus(repoPath),
          concurrency,
          (completed, total) => setProgress({ completed, total }),
          () => cancelledRef.current
        );

        if (statusCancelled) {
          setRepos(statuses.filter(Boolean));
          setPhase("cancelled");
          return;
        }

        setRepos(statuses);
        setPhase("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase("done");
      }
    }

    loadStatus();
  }, [options.filter, options.fetch, options.basePath]);

  useInput((input, key) => {
    if (key.escape) {
      if (phase === "finding" || phase === "fetching" || phase === "checking") {
        cancelledRef.current = true;
        setPhase("cancelling");
      } else if ((phase === "done" || phase === "cancelled") && onComplete) {
        onComplete();
      }
    }
  });

  useEffect(() => {
    if (!onComplete && (phase === "done" || phase === "cancelled")) {
      setTimeout(() => process.exit(0), 100);
    }
  }, [phase, onComplete]);

  const phaseLabel = phase === "fetching" ? "Fetching Remotes" : phase === "checking" ? "Checking Status" : "Repository Status";
  const duration = Math.round((Date.now() - startTime) / 1000);

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

  if (phase === "fetching" || phase === "checking" || phase === "cancelling") {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold color="cyan">{phaseLabel}</Text>
          <Text color="gray"> · {repoCount} repos · parallel: {parallel}</Text>
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
            <Text color="gray">Press Escape to cancel</Text>
          </Box>
        )}

        {fetchErrors.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Divider marginTop={0} marginBottom={1} />
            <ErrorsTable errors={fetchErrors} maxShow={8} />
          </Box>
        )}
      </Box>
    );
  }

  if (phase === "cancelled") {
    const cleanRepos = repos.filter(r => r.isClean && r.ahead === 0 && r.behind === 0);
    const dirtyRepos = repos.filter(r => !r.isClean || r.ahead > 0 || r.behind > 0);
    
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold color="cyan">Repository Status</Text>
          <Text color="gray"> · {repoCount} repos · parallel: {parallel}</Text>
        </Box>

        {fetchErrors.length > 0 && (
          <ErrorsTable errors={fetchErrors} maxShow={30} />
        )}

        {repos.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text color="gray">Partial results:</Text>
            <Box marginTop={1}>
              <StatusTable repos={repos} showClean={!options.quiet} />
            </Box>
          </Box>
        )}

        <Summary title="Cancelled">
          <SummaryRow label="Repositories checked" value={repos.length} />
          {cleanRepos.length > 0 && (
            <SummaryRow label="Clean" value={cleanRepos.length} color="green" />
          )}
          {dirtyRepos.length > 0 && (
            <SummaryRow label="With changes" value={dirtyRepos.length} color="yellow" />
          )}
          {fetchErrors.length > 0 && (
            <SummaryRow label="Fetch errors" value={fetchErrors.length} color="red" />
          )}
          <SummaryRow label="Not processed" value={repoCount - repos.length} color="yellow" />
          <SummaryRow label="Duration" value={`${duration}s`} color="gray" />
        </Summary>

        <Box marginTop={1}>
          <Text color="yellow">
            Operation cancelled. {repos.length} of {repoCount} repositories checked.
          </Text>
        </Box>

        <ReturnHint visible={!!onComplete} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">Error: {error}</Text>
        <ReturnHint visible={!!onComplete} />
      </Box>
    );
  }

  const cleanRepos = repos.filter(r => r.isClean && r.ahead === 0 && r.behind === 0);
  const dirtyRepos = repos.filter(r => !r.isClean || r.ahead > 0 || r.behind > 0);
  const aheadRepos = repos.filter(r => r.ahead > 0);
  const behindRepos = repos.filter(r => r.behind > 0);

  if (options.quiet) {
    if (dirtyRepos.length === 0) {
      return (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color="cyan">Repository Status</Text>
            <Text color="gray"> · {repos.length} repos · parallel: {parallel}</Text>
          </Box>
          
          <Text color="green">✓ All {repos.length} repositories are clean</Text>

          <Summary>
            <SummaryRow label="Repositories checked" value={repos.length} />
            <SummaryRow label="Clean" value={repos.length} color="green" />
            <SummaryRow label="Duration" value={`${duration}s`} color="gray" />
          </Summary>

          <ReturnHint visible={!!onComplete} />
        </Box>
      );
    }

    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold color="cyan">Repository Status</Text>
          <Text color="gray"> · {repos.length} repos · parallel: {parallel}</Text>
        </Box>
        
        {fetchErrors.length > 0 && (
          <ErrorsTable errors={fetchErrors} maxShow={10} />
        )}
        
        <StatusTable repos={dirtyRepos} showClean={false} />

        <Summary>
          <SummaryRow label="Repositories checked" value={repos.length} />
          <SummaryRow label="Clean" value={cleanRepos.length} color="green" />
          {dirtyRepos.length > 0 && (
            <SummaryRow label="With changes" value={dirtyRepos.length} color="yellow" />
          )}
          {fetchErrors.length > 0 && (
            <SummaryRow label="Fetch errors" value={fetchErrors.length} color="red" />
          )}
          <SummaryRow label="Duration" value={`${duration}s`} color="gray" />
        </Summary>

        <ReturnHint visible={!!onComplete} />
      </Box>
    );
  }

  if (options.summary) {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold color="cyan">Repository Status Summary</Text>
          <Text color="gray"> · {repos.length} repos · parallel: {parallel}</Text>
        </Box>
        
        <StatusSummary repos={repos} />

        <Summary>
          <SummaryRow label="Repositories checked" value={repos.length} />
          <SummaryRow label="Clean" value={cleanRepos.length} color="green" />
          {dirtyRepos.length > 0 && (
            <SummaryRow label="With changes" value={dirtyRepos.length} color="yellow" />
          )}
          {aheadRepos.length > 0 && (
            <SummaryRow label="Ahead" value={aheadRepos.length} color="cyan" />
          )}
          {behindRepos.length > 0 && (
            <SummaryRow label="Behind" value={behindRepos.length} color="magenta" />
          )}
          {fetchErrors.length > 0 && (
            <SummaryRow label="Fetch errors" value={fetchErrors.length} color="red" />
          )}
          <SummaryRow label="Duration" value={`${duration}s`} color="gray" />
        </Summary>

        <ReturnHint visible={!!onComplete} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">Repository Status</Text>
        <Text color="gray"> · {repos.length} repos · parallel: {parallel}</Text>
      </Box>
      
      {fetchErrors.length > 0 && (
        <ErrorsTable errors={fetchErrors} maxShow={10} />
      )}
      
      <Box marginTop={1}>
        <StatusTable repos={repos} showClean={true} />
      </Box>

      <Summary>
        <SummaryRow label="Repositories checked" value={repos.length} />
        <SummaryRow label="Clean" value={cleanRepos.length} color="green" />
        {dirtyRepos.length > 0 && (
          <SummaryRow label="With changes" value={dirtyRepos.length} color="yellow" />
        )}
        {aheadRepos.length > 0 && (
          <SummaryRow label="Ahead" value={aheadRepos.length} color="cyan" />
        )}
        {behindRepos.length > 0 && (
          <SummaryRow label="Behind" value={behindRepos.length} color="magenta" />
        )}
        {fetchErrors.length > 0 && (
          <SummaryRow label="Fetch errors" value={fetchErrors.length} color="red" />
        )}
        <SummaryRow label="Duration" value={`${duration}s`} color="gray" />
      </Summary>

      <ReturnHint visible={!!onComplete} />
    </Box>
  );
}

export async function runStatus(options: StatusOptions): Promise<void> {
  const { waitUntilExit } = render(<StatusApp options={options} />);
  await waitUntilExit();
}

