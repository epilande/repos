import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

interface ConfirmProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  defaultValue?: boolean;
  isDestructive?: boolean;
}

export function Confirm({
  message,
  onConfirm,
  onCancel,
  defaultValue = false,
  isDestructive = false,
}: ConfirmProps) {
  const [selected, setSelected] = useState(defaultValue);

  useInput((input, key) => {
    if (key.leftArrow || input === "y" || input === "Y") {
      setSelected(true);
    } else if (key.rightArrow || input === "n" || input === "N") {
      setSelected(false);
    } else if (key.return) {
      if (selected) {
        onConfirm();
      } else {
        onCancel();
      }
    } else if (key.escape) {
      onCancel();
    }
  });

  return (
    <Box flexDirection="column">
      <Text color={isDestructive ? "red" : "yellow"}>{message}</Text>
      <Box marginTop={1}>
        <Text>
          {selected ? (
            <>
              <Text color="green" bold>
                {">"} Yes
              </Text>
              <Text dimColor> / No</Text>
            </>
          ) : (
            <>
              <Text dimColor>Yes / </Text>
              <Text color="red" bold>
                {">"} No
              </Text>
            </>
          )}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          Press Y/N or arrow keys to select, Enter to confirm, Esc to cancel
        </Text>
      </Box>
    </Box>
  );
}

interface TypeConfirmProps {
  message: string;
  confirmText: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function TypeConfirm({
  message,
  confirmText,
  onConfirm,
  onCancel,
}: TypeConfirmProps) {
  const [input, setInput] = useState("");

  useInput((char, key) => {
    if (key.escape) {
      onCancel();
    } else if (key.return) {
      if (input === confirmText) {
        onConfirm();
      }
    } else if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
    } else if (char && !key.ctrl && !key.meta) {
      setInput((prev) => prev + char);
    }
  });

  const isMatch = input === confirmText;

  return (
    <Box flexDirection="column">
      <Text color="red">{message}</Text>
      <Box marginTop={1}>
        <Text>
          Type "<Text color="yellow">{confirmText}</Text>" to confirm:{" "}
        </Text>
        <Text color={isMatch ? "green" : "white"}>{input}</Text>
        <Text dimColor>│</Text>
      </Box>
      {isMatch && (
        <Box marginTop={1}>
          <Text color="green">Press Enter to confirm</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>Esc Cancel</Text>
      </Box>
    </Box>
  );
}

