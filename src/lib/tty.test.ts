import { describe, test, expect, afterEach } from "bun:test";
import { isInteractive, setForceInteractive } from "./tty.js";

describe("tty", () => {
  afterEach(() => {
    // Reset to test preload default (true)
    setForceInteractive(true);
  });

  describe("isInteractive", () => {
    test("returns forced value when set to true", () => {
      setForceInteractive(true);
      expect(isInteractive()).toBe(true);
    });

    test("returns forced value when set to false", () => {
      setForceInteractive(false);
      expect(isInteractive()).toBe(false);
    });

    test("falls back to process.stdin.isTTY when force is undefined", () => {
      setForceInteractive(undefined);
      // In test environment, process.stdin.isTTY is undefined/false
      expect(isInteractive()).toBe(false);
    });
  });

  describe("setForceInteractive", () => {
    test("overrides TTY detection", () => {
      setForceInteractive(false);
      expect(isInteractive()).toBe(false);

      setForceInteractive(true);
      expect(isInteractive()).toBe(true);
    });

    test("can be cleared with undefined", () => {
      setForceInteractive(true);
      expect(isInteractive()).toBe(true);

      setForceInteractive(undefined);
      // Falls back to actual TTY check
      expect(isInteractive()).toBe(process.stdin.isTTY === true);
    });
  });
});
