import React from "react";
import { Box, Text } from "ink";

interface DiffHighlightProps {
  content: string;
}

export function DiffHighlight({ content }: DiffHighlightProps) {
  const lines = content.split("\n");

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
