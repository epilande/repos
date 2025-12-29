import React from "react";
import { Box, Text } from "ink";

interface DiffHighlightProps {
  content: string;
  maxLines?: number;
}

export function DiffHighlight({ content, maxLines }: DiffHighlightProps) {
  const allLines = content.split("\n");
  const shouldTruncate = maxLines !== undefined && maxLines > 0 && allLines.length > maxLines;
  const lines = shouldTruncate ? allLines.slice(0, maxLines) : allLines;

  return (
    <Box flexDirection="column">
      {lines.map((line, idx) => {
        const color = getLineColor(line);
        return (
          <Text key={idx} color={color}>
            {line}
          </Text>
        );
      })}
      {shouldTruncate && (
        <Text color="yellow">
          ... (showing {maxLines} of {allLines.length} lines - use --stat for summary)
        </Text>
      )}
    </Box>
  );
}

const GRAY_PREFIXES = [
  "diff --git",
  "index ",
  "new file",
  "deleted file",
  "rename from",
  "rename to",
  "similarity index",
  "copy from",
  "copy to",
];

export function getLineColor(line: string): string | undefined {
  if (line.startsWith("+++") || line.startsWith("---")) {
    return "gray";
  }
  if (line.startsWith("+")) {
    return "green";
  }
  if (line.startsWith("-")) {
    return "red";
  }
  if (line.startsWith("@@")) {
    return "cyan";
  }
  if (line.startsWith("Binary files")) {
    return "magenta";
  }
  if (GRAY_PREFIXES.some((prefix) => line.startsWith(prefix))) {
    return "gray";
  }
  return undefined;
}
