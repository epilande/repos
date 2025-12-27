import React, { useState, useEffect } from "react";
import { render, Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { findRepos, filterRepos } from "../lib/repos.js";
import { checkoutBranch, getRepoStatus } from "../lib/git.js";
import { Divider } from "../components/Divider.js";
import type { CheckoutOptions, RepoOperationResult } from "../types.js";

interface CheckoutAppProps {
  options: CheckoutOptions;
  onComplete?: () => void;
}

type Phase = "finding" | "checking" | "done";

function getResultIcon(result: RepoOperationResult): { icon: string; color: string } {
  if (result.success) {
    if (result.message === "created") {
      return { icon: "+", color: "green" };
    }
    return { icon: "✓", color: "green" };
  }
  if (result.message === "skipped") {
    return { icon: "⚠", color: "yellow" };
  }
  if (result.message === "not found") {
    return { icon: "?", color: "yellow" };
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
        <Text color="gray">{result.details}</Text>
      )}
      {result.error && (
        <Text color="gray">({result.error})</Text>
      )}
    </Box>
  );
}

export function CheckoutApp({ options, onComplete }: CheckoutAppProps) {
  const [phase, setPhase] = useState<Phase>("finding");
  const [repos, setRepos] = useState<string[]>([]);
  const [results, setResults] = useState<RepoOperationResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!onComplete && phase === "done") {
      setTimeout(() => process.exit(0), 100);
    }
  }, [phase, onComplete]);

  useEffect(() => {
    async function runCheckout() {
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
        setPhase("checking");

        const allResults: RepoOperationResult[] = [];

        for (const repoPath of repoPaths) {
          const name = repoPath.split("/").pop() || repoPath;

          if (!options.force) {
            const status = await getRepoStatus(repoPath);
            if (status.modified > 0 || status.staged > 0) {
              allResults.push({
                name,
                success: false,
                message: "skipped",
                error: "Has uncommitted changes (use --force to skip)",
              });
              continue;
            }
          }

          const result = await checkoutBranch(repoPath, options.branch, {
            create: options.create,
          });

          allResults.push(result);
        }

        setResults(allResults);
        setPhase("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase("done");
      }
    }

    runCheckout();
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

  if (phase === "checking") {
    return (
      <Box>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Box marginLeft={1}>
          <Text>Checking out branch '{options.branch}'...</Text>
        </Box>
      </Box>
    );
  }

  const switched = results.filter(r => r.success && r.message === "switched").length;
  const created = results.filter(r => r.success && r.message === "created").length;
  const skipped = results.filter(r => r.message === "skipped").length;
  const notFound = results.filter(r => r.message === "not found").length;
  const errors = results.filter(r => !r.success && r.message !== "skipped" && r.message !== "not found").length;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Checkout Branch: {options.branch}
        </Text>
        <Text color="gray"> • {repos.length} repos</Text>
        {options.create && <Text color="gray"> • create if missing</Text>}
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {results.map(r => (
          <ResultRow key={r.name} result={r} />
        ))}
      </Box>

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
          {switched > 0 && (
            <Box>
              <Box width={25}>
                <Text color="green">Switched:</Text>
              </Box>
              <Text color="green">{switched}</Text>
            </Box>
          )}
          {created > 0 && (
            <Box>
              <Box width={25}>
                <Text color="green">Created:</Text>
              </Box>
              <Text color="green">{created}</Text>
            </Box>
          )}
          {skipped > 0 && (
            <Box>
              <Box width={25}>
                <Text color="yellow">Skipped:</Text>
              </Box>
              <Text color="yellow">{skipped}</Text>
            </Box>
          )}
          {notFound > 0 && (
            <Box>
              <Box width={25}>
                <Text color="yellow">Branch not found:</Text>
              </Box>
              <Text color="yellow">{notFound}</Text>
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
        </Box>
      </Box>

      {notFound > 0 && !options.create && (
        <Box marginTop={1}>
          <Text color="yellow">
            Tip: Use --create (-b) to create the branch in repos where it doesn't exist.
          </Text>
        </Box>
      )}

      {onComplete && (
        <Box marginTop={1}>
          <Text color="gray">Press Escape to return to menu</Text>
        </Box>
      )}
    </Box>
  );
}

export async function runCheckout(options: CheckoutOptions): Promise<void> {
  const { waitUntilExit } = render(<CheckoutApp options={options} />);
  await waitUntilExit();
}
