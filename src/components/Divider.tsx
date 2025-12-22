import React from "react";
import { Box, Text } from "ink";

interface DividerProps {
  width?: number;
  marginTop?: number;
  marginBottom?: number;
  color?: string;
  char?: string;
}

export function Divider({
  width = 50,
  marginTop = 1,
  marginBottom = 0,
  color = "gray",
  char = "─",
}: DividerProps) {
  return (
    <Box marginTop={marginTop} marginBottom={marginBottom}>
      <Text color={color}>{char.repeat(width)}</Text>
    </Box>
  );
}

