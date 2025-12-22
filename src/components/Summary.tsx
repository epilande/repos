import React from "react";
import { Box, Text } from "ink";

interface SummaryRowProps {
  label: string;
  value: string | number;
  color?: string;
  labelWidth?: number;
}

export function SummaryRow({
  label,
  value,
  color,
  labelWidth = 25,
}: SummaryRowProps) {
  return (
    <Box>
      <Box width={labelWidth}>
        <Text color={color}>{label}:</Text>
      </Box>
      <Text color={color}>{value}</Text>
    </Box>
  );
}

interface SummaryProps {
  title?: string;
  children: React.ReactNode;
  width?: number;
}

export function Summary({ title = "Summary", children, width = 50 }: SummaryProps) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="gray">{"─".repeat(width)}</Text>
      <Box marginTop={1} flexDirection="column">
        <Text bold>{title}:</Text>
        {children}
      </Box>
    </Box>
  );
}

interface ReturnHintProps {
  visible?: boolean;
}

export function ReturnHint({ visible = true }: ReturnHintProps) {
  if (!visible) return null;

  return (
    <Box marginTop={1}>
      <Text color="gray">Press Escape to return to menu</Text>
    </Box>
  );
}

