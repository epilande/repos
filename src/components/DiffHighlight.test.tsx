import { describe, test, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { DiffHighlight, getLineStyle } from "./DiffHighlight.js";

describe("getLineStyle", () => {
  describe("addition lines", () => {
    test("returns green for lines starting with +", () => {
      expect(getLineStyle("+added line")).toEqual({ color: "green" });
    });

    test("returns green for single +", () => {
      expect(getLineStyle("+")).toEqual({ color: "green" });
    });

    test("returns green for + with spaces", () => {
      expect(getLineStyle("+  indented")).toEqual({ color: "green" });
    });
  });

  describe("deletion lines", () => {
    test("returns red for lines starting with -", () => {
      expect(getLineStyle("-removed line")).toEqual({ color: "red" });
    });

    test("returns red for single -", () => {
      expect(getLineStyle("-")).toEqual({ color: "red" });
    });

    test("returns red for - with spaces", () => {
      expect(getLineStyle("-  indented")).toEqual({ color: "red" });
    });
  });

  describe("hunk headers", () => {
    test("returns cyan for @@ lines", () => {
      expect(getLineStyle("@@ -1,5 +1,6 @@")).toEqual({ color: "cyan" });
    });

    test("returns cyan for @@ with function context", () => {
      expect(getLineStyle("@@ -10,7 +10,8 @@ function test()")).toEqual({ color: "cyan" });
    });
  });

  describe("metadata lines", () => {
    test("returns dimColor for diff --git", () => {
      expect(getLineStyle("diff --git a/file.txt b/file.txt")).toEqual({ dimColor: true });
    });

    test("returns dimColor for index line", () => {
      expect(getLineStyle("index abc1234..def5678 100644")).toEqual({ dimColor: true });
    });

    test("returns dimColor for --- header", () => {
      expect(getLineStyle("--- a/file.txt")).toEqual({ dimColor: true });
    });

    test("returns dimColor for +++ header", () => {
      expect(getLineStyle("+++ b/file.txt")).toEqual({ dimColor: true });
    });

    test("returns dimColor for new file mode", () => {
      expect(getLineStyle("new file mode 100644")).toEqual({ dimColor: true });
    });

    test("returns dimColor for deleted file mode", () => {
      expect(getLineStyle("deleted file mode 100644")).toEqual({ dimColor: true });
    });

    test("returns dimColor for rename from", () => {
      expect(getLineStyle("rename from old-name.txt")).toEqual({ dimColor: true });
    });

    test("returns dimColor for rename to", () => {
      expect(getLineStyle("rename to new-name.txt")).toEqual({ dimColor: true });
    });

    test("returns dimColor for similarity index", () => {
      expect(getLineStyle("similarity index 95%")).toEqual({ dimColor: true });
    });

    test("returns dimColor for copy from", () => {
      expect(getLineStyle("copy from source.txt")).toEqual({ dimColor: true });
    });

    test("returns dimColor for copy to", () => {
      expect(getLineStyle("copy to dest.txt")).toEqual({ dimColor: true });
    });
  });

  describe("binary files", () => {
    test("returns magenta for binary files message", () => {
      expect(getLineStyle("Binary files a/image.png and b/image.png differ")).toEqual({ color: "magenta" });
    });
  });

  describe("context lines", () => {
    test("returns empty object for context lines", () => {
      expect(getLineStyle(" context line")).toEqual({});
    });

    test("returns empty object for empty line", () => {
      expect(getLineStyle("")).toEqual({});
    });

    test("returns empty object for plain text", () => {
      expect(getLineStyle("some random text")).toEqual({});
    });
  });

  describe("priority of patterns", () => {
    test("--- takes priority over single -", () => {
      expect(getLineStyle("--- a/file.txt")).toEqual({ dimColor: true });
    });

    test("+++ takes priority over single +", () => {
      expect(getLineStyle("+++ b/file.txt")).toEqual({ dimColor: true });
    });
  });
});

describe("DiffHighlight", () => {
  describe("rendering", () => {
    test("renders empty content", () => {
      const { lastFrame } = render(<DiffHighlight content="" />);
      expect(lastFrame()).toBe("");
    });

    test("renders single line", () => {
      const { lastFrame } = render(<DiffHighlight content="hello world" />);
      expect(lastFrame()).toContain("hello world");
    });

    test("renders multiple lines", () => {
      const content = "line 1\nline 2\nline 3";
      const { lastFrame } = render(<DiffHighlight content={content} />);
      const frame = lastFrame();
      expect(frame).toContain("line 1");
      expect(frame).toContain("line 2");
      expect(frame).toContain("line 3");
    });

    test("renders addition lines", () => {
      const content = "+first\n+second\n+third";
      const { lastFrame } = render(<DiffHighlight content={content} />);
      const frame = lastFrame()!;
      expect(frame).toContain("+first");
      expect(frame).toContain("+second");
      expect(frame).toContain("+third");
    });

    test("renders deletion lines", () => {
      const content = "-first\n-second\n-third";
      const { lastFrame } = render(<DiffHighlight content={content} />);
      const frame = lastFrame()!;
      expect(frame).toContain("-first");
      expect(frame).toContain("-second");
      expect(frame).toContain("-third");
    });

    test("renders hunk headers", () => {
      const { lastFrame } = render(
        <DiffHighlight content="@@ -1,5 +1,6 @@" />
      );
      expect(lastFrame()).toContain("@@ -1,5 +1,6 @@");
    });

    test("renders metadata lines", () => {
      const content = `diff --git a/file.txt b/file.txt
index abc1234..def5678 100644
--- a/file.txt
+++ b/file.txt`;
      const { lastFrame } = render(<DiffHighlight content={content} />);
      const frame = lastFrame()!;
      expect(frame).toContain("diff --git");
      expect(frame).toContain("index abc1234");
      expect(frame).toContain("--- a/file.txt");
      expect(frame).toContain("+++ b/file.txt");
    });
  });

  describe("full diff output", () => {
    test("renders a complete diff", () => {
      const diff = `diff --git a/test.txt b/test.txt
index abc1234..def5678 100644
--- a/test.txt
+++ b/test.txt
@@ -1,5 +1,6 @@
 context line
-removed line
+added line
 another context`;

      const { lastFrame } = render(<DiffHighlight content={diff} />);
      const frame = lastFrame()!;

      expect(frame).toContain("diff --git a/test.txt b/test.txt");
      expect(frame).toContain("index abc1234..def5678 100644");
      expect(frame).toContain("--- a/test.txt");
      expect(frame).toContain("+++ b/test.txt");
      expect(frame).toContain("@@ -1,5 +1,6 @@");
      expect(frame).toContain("context line");
      expect(frame).toContain("-removed line");
      expect(frame).toContain("+added line");
      expect(frame).toContain("another context");
    });

    test("handles diff with multiple files", () => {
      const diff = `diff --git a/file1.txt b/file1.txt
--- a/file1.txt
+++ b/file1.txt
@@ -1 +1 @@
-old content
+new content
diff --git a/file2.txt b/file2.txt
--- a/file2.txt
+++ b/file2.txt
@@ -1 +1 @@
-another old
+another new`;

      const { lastFrame } = render(<DiffHighlight content={diff} />);
      const frame = lastFrame()!;

      expect(frame).toContain("file1.txt");
      expect(frame).toContain("file2.txt");
      expect(frame).toContain("-old content");
      expect(frame).toContain("+new content");
      expect(frame).toContain("-another old");
      expect(frame).toContain("+another new");
    });
  });

  describe("edge cases", () => {
    test("handles lines with only + or -", () => {
      const { lastFrame } = render(<DiffHighlight content="+\n-" />);
      const frame = lastFrame()!;
      expect(frame).toContain("+");
      expect(frame).toContain("-");
    });

    test("handles binary file message", () => {
      const content = "Binary files a/image.png and b/image.png differ";
      const { lastFrame } = render(<DiffHighlight content={content} />);
      expect(lastFrame()).toContain("Binary files");
    });

    test("handles rename headers", () => {
      const content = `diff --git a/old.txt b/new.txt
similarity index 100%
rename from old.txt
rename to new.txt`;
      const { lastFrame } = render(<DiffHighlight content={content} />);
      const frame = lastFrame()!;
      expect(frame).toContain("rename from old.txt");
      expect(frame).toContain("rename to new.txt");
    });

    test("handles empty lines in diff", () => {
      const content = "+line1\n\n+line2";
      const { lastFrame } = render(<DiffHighlight content={content} />);
      const frame = lastFrame()!;
      expect(frame).toContain("+line1");
      expect(frame).toContain("+line2");
    });
  });

  describe("maxLines truncation", () => {
    test("does not truncate when maxLines is undefined", () => {
      const content = "line1\nline2\nline3\nline4\nline5";
      const { lastFrame } = render(<DiffHighlight content={content} />);
      const frame = lastFrame()!;
      expect(frame).toContain("line1");
      expect(frame).toContain("line5");
      expect(frame).not.toContain("more lines");
    });

    test("does not truncate when maxLines is 0", () => {
      const content = "line1\nline2\nline3\nline4\nline5";
      const { lastFrame } = render(<DiffHighlight content={content} maxLines={0} />);
      const frame = lastFrame()!;
      expect(frame).toContain("line1");
      expect(frame).toContain("line5");
      expect(frame).not.toContain("more lines");
    });

    test("does not truncate when content is within limit", () => {
      const content = "line1\nline2\nline3";
      const { lastFrame } = render(<DiffHighlight content={content} maxLines={5} />);
      const frame = lastFrame()!;
      expect(frame).toContain("line1");
      expect(frame).toContain("line3");
      expect(frame).not.toContain("more lines");
    });

    test("does not truncate when content equals limit", () => {
      const content = "line1\nline2\nline3";
      const { lastFrame } = render(<DiffHighlight content={content} maxLines={3} />);
      const frame = lastFrame()!;
      expect(frame).toContain("line1");
      expect(frame).toContain("line3");
      expect(frame).not.toContain("more lines");
    });

    test("truncates when content exceeds limit", () => {
      const content = "line1\nline2\nline3\nline4\nline5";
      const { lastFrame } = render(<DiffHighlight content={content} maxLines={3} />);
      const frame = lastFrame()!;
      expect(frame).toContain("line1");
      expect(frame).toContain("line2");
      expect(frame).toContain("line3");
      expect(frame).not.toContain("line4");
      expect(frame).not.toContain("line5");
    });

    test("shows truncation message with shown and total count", () => {
      const content = "line1\nline2\nline3\nline4\nline5";
      const { lastFrame } = render(<DiffHighlight content={content} maxLines={3} />);
      const frame = lastFrame()!;
      expect(frame).toContain("showing 3 of 5 lines");
      expect(frame).toContain("--stat");
    });

    test("truncates at maxLines=1", () => {
      const content = "line1\nline2\nline3";
      const { lastFrame } = render(<DiffHighlight content={content} maxLines={1} />);
      const frame = lastFrame()!;
      expect(frame).toContain("line1");
      expect(frame).not.toContain("line2");
      expect(frame).toContain("showing 1 of 3 lines");
    });

    test("truncates large diff and shows count", () => {
      const lines = Array.from({ length: 100 }, (_, i) => `+line${i + 1}`);
      const content = lines.join("\n");
      const { lastFrame } = render(<DiffHighlight content={content} maxLines={10} />);
      const frame = lastFrame()!;
      expect(frame).toContain("+line1");
      expect(frame).toContain("+line10");
      expect(frame).not.toContain("+line11");
      expect(frame).toContain("showing 10 of 100 lines");
    });
  });
});
