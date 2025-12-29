import { describe, test, expect, mock } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { GroupedMenu, type MenuGroup } from "./GroupedMenu.js";
import { waitFor } from "../../tests/helpers/ink-test-utils.js";

const testGroups: MenuGroup[] = [
  {
    category: "git",
    label: "Git Operations",
    items: [
      { label: "Status", value: "status", key: "s", description: "Check status of all repositories" },
      { label: "Fetch", value: "fetch", key: "f", description: "Fetch updates from remotes" },
    ],
  },
  {
    category: "repo",
    label: "Management",
    items: [
      { label: "Clone", value: "clone", key: "o", description: "Clone repositories" },
    ],
  },
];

// Helper to send keypress with retries (ink stdin can be unreliable)
async function sendKey(stdin: { write: (s: string) => void }, key: string, retries = 3) {
  for (let i = 0; i < retries; i++) {
    stdin.write(key);
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe("GroupedMenu", () => {
  describe("rendering", () => {
    test("displays group labels", () => {
      const onSelect = mock(() => {});
      const { lastFrame, unmount } = render(
        <GroupedMenu groups={testGroups} onSelect={onSelect} />
      );

      const frame = lastFrame();
      expect(frame).toContain("Git Operations");
      expect(frame).toContain("Management");
      unmount();
    });

    test("displays menu items with hotkeys", () => {
      const onSelect = mock(() => {});
      const { lastFrame, unmount } = render(
        <GroupedMenu groups={testGroups} onSelect={onSelect} />
      );

      const frame = lastFrame();
      expect(frame).toContain("s  Status");
      expect(frame).toContain("f  Fetch");
      expect(frame).toContain("o  Clone");
      unmount();
    });

    test("displays description for selected item", () => {
      const onSelect = mock(() => {});
      const { lastFrame, unmount } = render(
        <GroupedMenu groups={testGroups} onSelect={onSelect} />
      );

      const frame = lastFrame();
      // First item should be selected by default
      expect(frame).toContain("Check status of all repositories");
      unmount();
    });

    test("displays keyboard hints footer", () => {
      const onSelect = mock(() => {});
      const { lastFrame, unmount } = render(
        <GroupedMenu groups={testGroups} onSelect={onSelect} />
      );

      const frame = lastFrame();
      expect(frame).toContain("navigate");
      expect(frame).toContain("Enter");
      expect(frame).toContain("q quit");
      unmount();
    });

    test("shows selection indicator on first item", () => {
      const onSelect = mock(() => {});
      const { lastFrame, unmount } = render(
        <GroupedMenu groups={testGroups} onSelect={onSelect} />
      );

      const frame = lastFrame();
      expect(frame).toContain("❯");
      unmount();
    });
  });

  describe("keyboard selection", () => {
    test("Enter selects current item", async () => {
      let selectedItem: unknown = null;
      const onSelect = mock((item) => {
        selectedItem = item;
      });
      const { stdin, unmount } = render(
        <GroupedMenu groups={testGroups} onSelect={onSelect} />
      );

      await new Promise((r) => setTimeout(r, 50));
      await sendKey(stdin, "\r"); // Enter

      await waitFor(() => selectedItem !== null, 1000);
      expect(onSelect).toHaveBeenCalled();
      expect(selectedItem).toEqual(testGroups[0].items[0]);
      unmount();
    });
  });

  describe("hotkeys", () => {
    test("pressing hotkey triggers onSelect for that item", async () => {
      let selectedItem: unknown = null;
      const onSelect = mock((item) => {
        selectedItem = item;
      });
      const { stdin, unmount } = render(
        <GroupedMenu groups={testGroups} onSelect={onSelect} />
      );

      await new Promise((r) => setTimeout(r, 50));
      await sendKey(stdin, "f"); // Hotkey for Fetch

      await waitFor(() => selectedItem !== null, 1000);
      expect(onSelect).toHaveBeenCalled();
      expect(selectedItem).toMatchObject({ value: "fetch", key: "f" });
      unmount();
    });

    test("hotkeys are case-insensitive", async () => {
      let selectedItem: unknown = null;
      const onSelect = mock((item) => {
        selectedItem = item;
      });
      const { stdin, unmount } = render(
        <GroupedMenu groups={testGroups} onSelect={onSelect} />
      );

      await new Promise((r) => setTimeout(r, 50));
      await sendKey(stdin, "S"); // Uppercase S for Status

      await waitFor(() => selectedItem !== null, 1000);
      expect(onSelect).toHaveBeenCalled();
      expect(selectedItem).toMatchObject({ value: "status", key: "s" });
      unmount();
    });

    test("hotkey from different group works", async () => {
      let selectedItem: unknown = null;
      const onSelect = mock((item) => {
        selectedItem = item;
      });
      const { stdin, unmount } = render(
        <GroupedMenu groups={testGroups} onSelect={onSelect} />
      );

      await new Promise((r) => setTimeout(r, 50));
      await sendKey(stdin, "o"); // Hotkey for Clone (in repo group)

      await waitFor(() => selectedItem !== null, 1000);
      expect(onSelect).toHaveBeenCalled();
      expect(selectedItem).toMatchObject({ value: "clone", key: "o" });
      unmount();
    });

    test("invalid hotkey does nothing", async () => {
      const onSelect = mock(() => {});
      const { stdin, unmount } = render(
        <GroupedMenu groups={testGroups} onSelect={onSelect} />
      );

      await new Promise((r) => setTimeout(r, 50));
      stdin.write("z"); // Not a valid hotkey
      await new Promise((r) => setTimeout(r, 100));

      expect(onSelect).not.toHaveBeenCalled();
      unmount();
    });
  });

  describe("items without hotkeys", () => {
    test("renders items without hotkey field", () => {
      const groupsWithoutKeys: MenuGroup[] = [
        {
          category: "test",
          label: "Test Group",
          items: [
            { label: "Item One", value: "one" },
            { label: "Item Two", value: "two" },
          ],
        },
      ];

      const onSelect = mock(() => {});
      const { lastFrame, unmount } = render(
        <GroupedMenu groups={groupsWithoutKeys} onSelect={onSelect} />
      );

      const frame = lastFrame();
      expect(frame).toContain("Item One");
      expect(frame).toContain("Item Two");
      unmount();
    });
  });

  describe("multiple groups", () => {
    test("renders all groups in order", () => {
      const onSelect = mock(() => {});
      const { lastFrame, unmount } = render(
        <GroupedMenu groups={testGroups} onSelect={onSelect} />
      );

      const frame = lastFrame()!;
      const gitIndex = frame.indexOf("Git Operations");
      const repoIndex = frame.indexOf("Management");

      // Git Operations should appear before Management
      expect(gitIndex).toBeLessThan(repoIndex);
      unmount();
    });

    test("renders correct number of items", () => {
      const onSelect = mock(() => {});
      const { lastFrame, unmount } = render(
        <GroupedMenu groups={testGroups} onSelect={onSelect} />
      );

      const frame = lastFrame();
      expect(frame).toContain("Status");
      expect(frame).toContain("Fetch");
      expect(frame).toContain("Clone");
      unmount();
    });
  });
});
