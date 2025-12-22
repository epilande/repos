import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";

export type FieldType = "toggle" | "text" | "number";

export interface FormField {
  name: string;
  label: string;
  type: FieldType;
  defaultValue?: boolean | string | number;
  placeholder?: string;
  hint?: string;
}

interface OptionsFormProps {
  title: string;
  fields: FormField[];
  onSubmit: (values: Record<string, boolean | string | number | undefined>) => void;
  onCancel: () => void;
  submitLabel?: string;
}

export function OptionsForm({
  title,
  fields,
  onSubmit,
  onCancel,
  submitLabel = "Start",
}: OptionsFormProps) {
  const [values, setValues] = useState<Record<string, boolean | string | number | undefined>>(() => {
    const initial: Record<string, boolean | string | number | undefined> = {};
    for (const field of fields) {
      initial[field.name] = field.defaultValue;
    }
    return initial;
  });

  const [focusIndex, setFocusIndex] = useState(0);
  const totalItems = fields.length;

  const [isEditing, setIsEditing] = useState(false);

  const currentField = fields[focusIndex] ?? null;

  const handleToggle = useCallback((fieldName: string) => {
    setValues((prev) => ({
      ...prev,
      [fieldName]: !prev[fieldName],
    }));
  }, []);

  const handleTextChange = useCallback((fieldName: string, value: string) => {
    setValues((prev) => ({
      ...prev,
      [fieldName]: value,
    }));
  }, []);

  const handleNumberChange = useCallback((fieldName: string, value: string) => {
    const num = value === "" ? undefined : parseInt(value, 10);
    setValues((prev) => ({
      ...prev,
      [fieldName]: isNaN(num as number) ? prev[fieldName] : num,
    }));
  }, []);

  const doSubmit = useCallback(() => {
    const finalValues: Record<string, boolean | string | number | undefined> = {};
    for (const field of fields) {
      const val = values[field.name];
      if (field.type === "number" && typeof val === "string") {
        const num = parseInt(val, 10);
        finalValues[field.name] = isNaN(num) ? undefined : num;
      } else if (field.type === "number" && val === "") {
        finalValues[field.name] = undefined;
      } else {
        finalValues[field.name] = val;
      }
    }
    onSubmit(finalValues);
  }, [fields, values, onSubmit]);

  useInput((input, key) => {
    if (!isEditing) {
      if (key.upArrow || input === "k") {
        setFocusIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1));
        return;
      }

      if (key.downArrow || input === "j") {
        setFocusIndex((prev) => (prev < totalItems - 1 ? prev + 1 : 0));
        return;
      }

      if (key.tab) {
        if (key.shift) {
          setFocusIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1));
        } else {
          setFocusIndex((prev) => (prev < totalItems - 1 ? prev + 1 : 0));
        }
        return;
      }
    }

    if (key.escape) {
      if (isEditing) {
        setIsEditing(false);
      } else {
        onCancel();
      }
      return;
    }

    if (key.delete && !isEditing) {
      onCancel();
      return;
    }

    if (key.return) {
      if (isEditing) {
        setIsEditing(false);
      }
      doSubmit();
      return;
    }

    if (input === " " && !isEditing && currentField) {
      if (currentField.type === "toggle") {
        handleToggle(currentField.name);
      } else {
        setIsEditing(true);
      }
      return;
    }
  });

  const renderField = (field: FormField, index: number) => {
    const isFocused = focusIndex === index;
    const value = values[field.name];

    if (field.type === "toggle") {
      const isChecked = Boolean(value);
      return (
        <Box key={field.name} flexDirection="column">
          <Box>
            <Text color={isFocused ? "cyan" : undefined}>
              {isFocused ? "❯ " : "  "}
            </Text>
            <Text color={isFocused ? "cyan" : undefined}>
              [{isChecked ? "✓" : " "}]
            </Text>
            <Text color={isFocused ? "white" : "gray"}> {field.label}</Text>
          </Box>
          {field.hint && isFocused && (
            <Box marginLeft={6}>
              <Text dimColor italic>
                {field.hint}
              </Text>
            </Box>
          )}
        </Box>
      );
    }

    const displayValue = value !== undefined ? String(value) : "";
    const isEditingThis = isFocused && isEditing;

    return (
      <Box key={field.name} flexDirection="column">
        <Box>
          <Text color={isFocused ? "cyan" : undefined}>
            {isFocused ? "❯ " : "  "}
          </Text>
          <Text color={isFocused ? "white" : "gray"}>{field.label}: </Text>
          {isEditingThis ? (
            <TextInput
              value={displayValue}
              onChange={(newValue) => {
                if (field.type === "number") {
                  handleNumberChange(field.name, newValue.replace(/[^0-9]/g, ""));
                } else {
                  handleTextChange(field.name, newValue);
                }
              }}
              onSubmit={() => setIsEditing(false)}
              placeholder={field.placeholder}
            />
          ) : (
            <Text color={displayValue ? "green" : "gray"}>
              {displayValue || field.placeholder || "(empty)"}
            </Text>
          )}
        </Box>
        {field.hint && isFocused && (
          <Box marginLeft={2}>
            <Text dimColor italic>
              {field.hint}
            </Text>
          </Box>
        )}
        {isFocused && !isEditing && (field.type === "text" || field.type === "number") && (
          <Box marginLeft={2}>
            <Text dimColor>Space to edit</Text>
          </Box>
        )}
      </Box>
    );
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {title}
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="gray">{"─".repeat(40)}</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {fields.map((field, index) => renderField(field, index))}
      </Box>

      <Box marginBottom={1}>
        <Text color="gray">{"─".repeat(40)}</Text>
      </Box>

      <Box flexDirection="column">
        <Text color="gray">
          ↑↓/jk Navigate • Space Toggle/Edit • Enter {submitLabel} •{" "}
          {isEditing ? "Esc Done" : "⌫/Esc Back"}
        </Text>
      </Box>
    </Box>
  );
}
