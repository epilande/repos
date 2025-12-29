import { useState } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";

export interface MenuItem {
  label: string;
  value: string;
  key?: string; // Single-character hotkey (e.g., "s" for Status)
  description?: string; // Shown when item is selected
}

export interface MenuGroup {
  category: string;
  label: string;
  items: MenuItem[];
}

interface GroupedMenuProps {
  groups: MenuGroup[];
  onSelect: (item: MenuItem) => void;
}

export function GroupedMenu({ groups, onSelect }: GroupedMenuProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectableItems = groups.flatMap((g) => g.items);
  const totalItems = selectableItems.length;
  const selectedItem = selectableItems[selectedIndex];

  // Responsive layout: 3 columns on wide terminals, 1 column on narrow
  const terminalWidth = stdout?.columns ?? 80;
  const columnLayout = terminalWidth >= 65 ? 3 : 1;

  useInput((input, key) => {
    if (input === "q") {
      exit();
      return;
    }

    if (key.upArrow || input === "k") {
      setSelectedIndex((i) => (i > 0 ? i - 1 : totalItems - 1));
    } else if (key.downArrow || input === "j") {
      setSelectedIndex((i) => (i < totalItems - 1 ? i + 1 : 0));
    } else if (key.return) {
      onSelect(selectableItems[selectedIndex]);
    } else {
      const item = selectableItems.find(
        (i) => i.key?.toLowerCase() === input.toLowerCase()
      );
      if (item) {
        onSelect(item);
      }
    }
  });

  // Track index across columns to maintain correct selection mapping
  let globalIndex = 0;

  const renderGroup = (group: MenuGroup, marginTop = 0) => {
    return (
      <Box key={group.category} flexDirection="column" marginTop={marginTop}>
        <Text bold color="cyan">
          {group.label}
        </Text>
        <Box marginTop={1} flexDirection="column">
          {group.items.map((item) => {
            const currentIndex = globalIndex++;
            const isSelected = currentIndex === selectedIndex;
            return (
              <Box key={item.value}>
                <Text color={isSelected ? "cyan" : undefined}>
                  {isSelected ? "❯  " : "   "}
                </Text>
                <Text dimColor>{item.key ? `${item.key} ` : "  "}</Text>
                <Text>{" "}</Text>
                <Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
                  {item.label}
                </Text>
              </Box>
            );
          })}
        </Box>
      </Box>
    );
  };

  const renderDescription = () => {
    if (!selectedItem?.description) return null;
    return (
      <Box marginTop={1}>
        <Text dimColor>{selectedItem.description}</Text>
      </Box>
    );
  };

  const renderFooter = () => (
    <Box marginTop={1}>
      <Text dimColor>↑↓/jk Navigate • Enter Select • q Quit</Text>
    </Box>
  );

  // 3-column layout
  if (columnLayout === 3) {
    globalIndex = 0;
    const columnWidth = Math.floor((terminalWidth - 8) / 3);

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={2}>
          {groups.map((group) => (
            <Box key={group.category} flexDirection="column" width={columnWidth}>
              {renderGroup(group)}
            </Box>
          ))}
        </Box>

        {renderDescription()}
        {renderFooter()}
      </Box>
    );
  }

  // Single column layout
  globalIndex = 0;

  return (
    <Box flexDirection="column">
      {groups.map((group, idx) => renderGroup(group, idx > 0 ? 1 : 0))}
      {renderDescription()}
      {renderFooter()}
    </Box>
  );
}
