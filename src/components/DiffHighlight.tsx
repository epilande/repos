import React from "react";
import { Box, Text } from "ink";

interface DiffHighlightProps {
  content: string;
  maxLines?: number;
}

interface LineStyle {
  color?: string;
  dimColor?: boolean;
}

export function DiffHighlight({ content, maxLines }: DiffHighlightProps) {
  const allLines = content.split("\n");
  const shouldTruncate = maxLines !== undefined && maxLines > 0 && allLines.length > maxLines;
  const lines = shouldTruncate ? allLines.slice(0, maxLines) : allLines;

  return (
    <Box flexDirection="column">
      {lines.map((line, idx) => {
        const style = getLineStyle(line);
        return (
          <Text key={idx} color={style.color} dimColor={style.dimColor}>
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

const DIM_PREFIXES = [
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

export function getLineStyle(line: string): LineStyle {
  if (line.startsWith("+++") || line.startsWith("---")) {
    return { dimColor: true };
  }
  if (line.startsWith("+")) {
    return { color: "green" };
  }
  if (line.startsWith("-")) {
    return { color: "red" };
  }
  if (line.startsWith("@@")) {
    return { color: "cyan" };
  }
  if (line.startsWith("Binary files")) {
    return { color: "magenta" };
  }
  if (DIM_PREFIXES.some((prefix) => line.startsWith(prefix))) {
    return { dimColor: true };
  }
  return {};
}
