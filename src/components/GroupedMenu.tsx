import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

export interface MenuItem {
  label: string;
  value: string;
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
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Flatten items for navigation (excluding headers)
  const selectableItems = groups.flatMap((g) => g.items);
  const totalItems = selectableItems.length;

  useInput((input, key) => {
    if (key.upArrow || input === "k") {
      setSelectedIndex((i) => (i > 0 ? i - 1 : totalItems - 1));
    } else if (key.downArrow || input === "j") {
      setSelectedIndex((i) => (i < totalItems - 1 ? i + 1 : 0));
    } else if (key.return) {
      onSelect(selectableItems[selectedIndex]);
    }
  });

  let itemIndex = 0;

  return (
    <Box flexDirection="column">
      {groups.map((group, groupIdx) => (
        <Box
          key={group.category}
          flexDirection="column"
          marginTop={groupIdx > 0 ? 1 : 0}
        >
          <Text bold color="gray">
            {group.label}
          </Text>
          {group.items.map((item) => {
            const currentIndex = itemIndex++;
            const isSelected = currentIndex === selectedIndex;
            return (
              <Box key={item.value} paddingLeft={2}>
                <Text color={isSelected ? "cyan" : undefined}>
                  {isSelected ? "❯ " : "  "}
                  {item.label}
                </Text>
              </Box>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}
