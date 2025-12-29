import React from "react";
import { Box, Text } from "ink";

interface ProgressBarProps {
  value: number;
  total: number;
  width?: number;
  label?: string;
  showPercentage?: boolean;
  showCount?: boolean;
}

export function ProgressBar({
  value,
  total,
  width = 30,
  label,
  showPercentage = true,
  showCount = true,
}: ProgressBarProps) {
  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
  const filled = total > 0 ? Math.round((value / total) * width) : 0;
  const empty = width - filled;

  const filledBar = "█".repeat(filled);
  const emptyBar = "░".repeat(empty);

  return (
    <Box>
      {label && (
        <Box marginRight={1}>
          <Text>{label}</Text>
        </Box>
      )}
      <Text color="green">{filledBar}</Text>
      <Text dimColor>{emptyBar}</Text>
      {showPercentage && (
        <Box marginLeft={1}>
          <Text color="cyan">{percentage}%</Text>
        </Box>
      )}
      {showCount && (
        <Box marginLeft={1}>
          <Text dimColor>
            ({value}/{total})
          </Text>
        </Box>
      )}
    </Box>
  );
}

interface SpinnerProgressProps {
  value: number;
  total: number;
  label?: string;
}

export function SpinnerProgress({
  value,
  total,
  label = "Processing",
}: SpinnerProgressProps) {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const [frameIndex, setFrameIndex] = React.useState(0);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % frames.length);
    }, 80);

    return () => clearInterval(interval);
  }, []);

  const isComplete = value >= total;

  return (
    <Box>
      {isComplete ? (
        <Text color="green">✓</Text>
      ) : (
        <Text color="cyan">{frames[frameIndex]}</Text>
      )}
      <Box marginLeft={1}>
        <Text>
          {label} {value}/{total}
        </Text>
      </Box>
    </Box>
  );
}

