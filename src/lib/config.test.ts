import { describe, test, expect } from "bun:test";
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { homedir, tmpdir } from "os";
import {
  loadConfig,
  saveConfig,
  configExists,
  getConfigValue,
  setConfigValue,
  getCwdConfigPath,
  getHomeConfigPath,
} from "./config.js";
import { DEFAULT_CONFIG } from "../types.js";

describe("config.ts", () => {
  describe("getCwdConfigPath", () => {
    test("returns correct path", () => {
      const path = getCwdConfigPath();
      expect(path).toContain(".reposrc.json");
      expect(path).toContain(process.cwd());
    });
  });

  describe("getHomeConfigPath", () => {
    test("returns correct path in home directory", () => {
      const path = getHomeConfigPath();
      expect(path).toContain(".reposrc.json");
      expect(path).toContain(homedir());
    });
  });

  describe("loadConfig", () => {
    test("returns default config when no config files exist", async () => {
      // Create a temp directory with no config
      const tempDir = join(tmpdir(), `no-config-${Date.now()}`);
      await mkdir(tempDir, { recursive: true });

      try {
        const config = await loadConfig(tempDir);
        expect(config.parallel).toBe(DEFAULT_CONFIG.parallel);
        expect(config.timeout).toBe(DEFAULT_CONFIG.timeout);
        expect(config.daysThreshold).toBe(DEFAULT_CONFIG.daysThreshold);
        expect(config.diffMaxLines).toBe(DEFAULT_CONFIG.diffMaxLines);
        expect(config.github?.host).toBe(DEFAULT_CONFIG.github?.host);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });

    test("loads config from cwd when it exists", async () => {
      const tempDir = join(tmpdir(), `cwd-config-${Date.now()}`);
      await mkdir(tempDir, { recursive: true });

      const customConfig = {
        org: "test-org",
        parallel: 5,
      };

      await writeFile(
        join(tempDir, ".reposrc.json"),
        JSON.stringify(customConfig)
      );

      try {
        const config = await loadConfig(tempDir);
        expect(config.org).toBe("test-org");
        expect(config.parallel).toBe(5);
        // Should merge with defaults
        expect(config.timeout).toBe(DEFAULT_CONFIG.timeout);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });

    test("loads diffMaxLines from config", async () => {
      const tempDir = join(tmpdir(), `diff-config-${Date.now()}`);
      await mkdir(tempDir, { recursive: true });

      const customConfig = {
        diffMaxLines: 200,
      };

      await writeFile(
        join(tempDir, ".reposrc.json"),
        JSON.stringify(customConfig)
      );

      try {
        const config = await loadConfig(tempDir);
        expect(config.diffMaxLines).toBe(200);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });

    test("loads diffMaxLines of 0 for unlimited", async () => {
      const tempDir = join(tmpdir(), `diff-unlimited-${Date.now()}`);
      await mkdir(tempDir, { recursive: true });

      const customConfig = {
        diffMaxLines: 0,
      };

      await writeFile(
        join(tempDir, ".reposrc.json"),
        JSON.stringify(customConfig)
      );

      try {
        const config = await loadConfig(tempDir);
        expect(config.diffMaxLines).toBe(0);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe("saveConfig", () => {
    test("saves config to cwd", async () => {
      const tempDir = join(tmpdir(), `save-config-${Date.now()}`);
      await mkdir(tempDir, { recursive: true });

      const config = {
        org: "saved-org",
        parallel: 15,
      };

      try {
        await saveConfig(config, "cwd", tempDir);

        // Verify file was created
        const file = Bun.file(join(tempDir, ".reposrc.json"));
        expect(await file.exists()).toBe(true);

        // Verify contents
        const saved = JSON.parse(await file.text());
        expect(saved.org).toBe("saved-org");
        expect(saved.parallel).toBe(15);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe("configExists", () => {
    test("returns false when no config exists", async () => {
      const tempDir = join(tmpdir(), `no-exist-${Date.now()}`);
      await mkdir(tempDir, { recursive: true });

      try {
        const exists = await configExists("cwd", tempDir);
        expect(exists).toBe(false);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });

    test("returns true when cwd config exists", async () => {
      const tempDir = join(tmpdir(), `exist-config-${Date.now()}`);
      await mkdir(tempDir, { recursive: true });

      await writeFile(join(tempDir, ".reposrc.json"), "{}");

      try {
        const exists = await configExists("cwd", tempDir);
        expect(exists).toBe(true);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe("getConfigValue", () => {
    test("gets top-level value", () => {
      const config = { org: "my-org", parallel: 10 };
      expect(getConfigValue(config, "org")).toBe("my-org");
      expect(getConfigValue(config, "parallel")).toBe(10);
    });

    test("gets nested value", () => {
      const config = {
        github: { host: "github.example.com", apiUrl: "https://api.example.com" },
      };
      expect(getConfigValue(config, "github.host")).toBe("github.example.com");
      expect(getConfigValue(config, "github.apiUrl")).toBe("https://api.example.com");
    });

    test("returns undefined for non-existent key", () => {
      const config = { org: "my-org" };
      expect(getConfigValue(config, "nonexistent")).toBeUndefined();
    });

    test("returns undefined for non-existent nested key", () => {
      const config = { github: { host: "github.com", apiUrl: "https://api.github.com" } };
      expect(getConfigValue(config, "github.nonexistent")).toBeUndefined();
    });
  });

  describe("setConfigValue", () => {
    test("sets top-level value", () => {
      const config = { org: "old-org" };
      const updated = setConfigValue(config, "org", "new-org");
      expect(updated.org).toBe("new-org");
    });

    test("sets nested github value", () => {
      const config = { github: { host: "github.com", apiUrl: "https://api.github.com" } };
      const updated = setConfigValue(config, "github.host", "github.example.com");
      expect(updated.github?.host).toBe("github.example.com");
    });

    test("does not mutate original config", () => {
      const config = { org: "original" };
      const updated = setConfigValue(config, "org", "changed");
      expect(config.org).toBe("original");
      expect(updated.org).toBe("changed");
    });

    test("preserves other values when updating", () => {
      const config = {
        org: "my-org",
        parallel: 10,
        github: { host: "github.com", apiUrl: "https://api.github.com" },
      };
      const updated = setConfigValue(config, "parallel", 20);
      expect(updated.org).toBe("my-org");
      expect(updated.parallel).toBe(20);
    });
  });
});
