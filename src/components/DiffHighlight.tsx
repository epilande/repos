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
  const remainingLines = shouldTruncate ? allLines.length - maxLines : 0;

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
          ... ({remainingLines} more {remainingLines === 1 ? "line" : "lines"} - use --stat for summary)
        </Text>
      )}
    </Box>
  );
}

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
  if (
    line.startsWith("diff --git") ||
    line.startsWith("index ") ||
    line.startsWith("new file") ||
    line.startsWith("deleted file")
  ) {
    return "gray";
  }
  return undefined;
}
