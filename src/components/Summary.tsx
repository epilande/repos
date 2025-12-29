import React from "react";
import { Box, Text } from "ink";
import { Divider } from "./Divider.js";

interface SummaryRowProps {
  label: string;
  value: string | number;
  color?: string;
  dimColor?: boolean;
  labelWidth?: number;
}

export function SummaryRow({
  label,
  value,
  color,
  dimColor,
  labelWidth = 25,
}: SummaryRowProps) {
  return (
    <Box>
      <Box width={labelWidth}>
        <Text color={color} dimColor={dimColor}>{label}:</Text>
      </Box>
      <Text color={color} dimColor={dimColor}>{value}</Text>
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
    <Box flexDirection="column">
      <Divider width={width} />
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
      <Text dimColor>⌫/Esc Back</Text>
    </Box>
  );
}

