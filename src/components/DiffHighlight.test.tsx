import { describe, test, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { DiffHighlight, getLineColor } from "./DiffHighlight.js";

describe("getLineColor", () => {
  describe("addition lines", () => {
    test("returns green for lines starting with +", () => {
      expect(getLineColor("+added line")).toBe("green");
    });

    test("returns green for single +", () => {
      expect(getLineColor("+")).toBe("green");
    });

    test("returns green for + with spaces", () => {
      expect(getLineColor("+  indented")).toBe("green");
    });
  });

  describe("deletion lines", () => {
    test("returns red for lines starting with -", () => {
      expect(getLineColor("-removed line")).toBe("red");
    });

    test("returns red for single -", () => {
      expect(getLineColor("-")).toBe("red");
    });

    test("returns red for - with spaces", () => {
      expect(getLineColor("-  indented")).toBe("red");
    });
  });

  describe("hunk headers", () => {
    test("returns cyan for @@ lines", () => {
      expect(getLineColor("@@ -1,5 +1,6 @@")).toBe("cyan");
    });

    test("returns cyan for @@ with function context", () => {
      expect(getLineColor("@@ -10,7 +10,8 @@ function test()")).toBe("cyan");
    });
  });

  describe("metadata lines", () => {
    test("returns gray for diff --git", () => {
      expect(getLineColor("diff --git a/file.txt b/file.txt")).toBe("gray");
    });

    test("returns gray for index line", () => {
      expect(getLineColor("index abc1234..def5678 100644")).toBe("gray");
    });

    test("returns gray for --- header", () => {
      expect(getLineColor("--- a/file.txt")).toBe("gray");
    });

    test("returns gray for +++ header", () => {
      expect(getLineColor("+++ b/file.txt")).toBe("gray");
    });

    test("returns gray for new file mode", () => {
      expect(getLineColor("new file mode 100644")).toBe("gray");
    });

    test("returns gray for deleted file mode", () => {
      expect(getLineColor("deleted file mode 100644")).toBe("gray");
    });

    test("returns gray for rename from", () => {
      expect(getLineColor("rename from old-name.txt")).toBe("gray");
    });

    test("returns gray for rename to", () => {
      expect(getLineColor("rename to new-name.txt")).toBe("gray");
    });

    test("returns gray for similarity index", () => {
      expect(getLineColor("similarity index 95%")).toBe("gray");
    });

    test("returns gray for copy from", () => {
      expect(getLineColor("copy from source.txt")).toBe("gray");
    });

    test("returns gray for copy to", () => {
      expect(getLineColor("copy to dest.txt")).toBe("gray");
    });
  });

  describe("binary files", () => {
    test("returns magenta for binary files message", () => {
      expect(getLineColor("Binary files a/image.png and b/image.png differ")).toBe("magenta");
    });
  });

  describe("context lines", () => {
    test("returns undefined for context lines", () => {
      expect(getLineColor(" context line")).toBeUndefined();
    });

    test("returns undefined for empty line", () => {
      expect(getLineColor("")).toBeUndefined();
    });

    test("returns undefined for plain text", () => {
      expect(getLineColor("some random text")).toBeUndefined();
    });
  });

  describe("priority of patterns", () => {
    test("--- takes priority over single -", () => {
      expect(getLineColor("--- a/file.txt")).toBe("gray");
    });

    test("+++ takes priority over single +", () => {
      expect(getLineColor("+++ b/file.txt")).toBe("gray");
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
