import { Box, Text } from "ink";

interface DividerProps {
  width?: number;
  marginTop?: number;
  marginBottom?: number;
  dimColor?: boolean;
  char?: string;
}

export function Divider({
  width = 50,
  marginTop = 1,
  marginBottom = 0,
  dimColor = true,
  char = "─",
}: DividerProps) {
  return (
    <Box marginTop={marginTop} marginBottom={marginBottom}>
      <Text dimColor={dimColor}>{char.repeat(width)}</Text>
    </Box>
  );
}

