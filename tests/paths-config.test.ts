import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, saveConfig } from "../src/core/config";
import { resolveSeitonPaths } from "../src/core/paths";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("resolveSeitonPaths", () => {
  it("uses XDG config and state directories when provided", () => {
    expect(resolveSeitonPaths(
      { XDG_CONFIG_HOME: "/cfg", XDG_STATE_HOME: "/state" },
      "linux",
      "/home/tester"
    )).toEqual({
      configDir: "/cfg/seiton",
      stateDir: "/state/seiton"
    });
  });

  it("falls back to home config and state directories", () => {
    expect(resolveSeitonPaths({}, "darwin", "/Users/tester")).toEqual({
      configDir: "/Users/tester/.config/seiton",
      stateDir: "/Users/tester/.local/state/seiton"
    });
  });
});

describe("config persistence", () => {
  it("defaults to kitty when config is missing", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "seiton-config-"));

    await expect(loadConfig(tempDir)).resolves.toEqual({
      terminalBackend: "kitty"
    });
  });

  it("loads wezterm when configured", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "seiton-config-"));
    await saveConfig(tempDir, { terminalBackend: "wezterm" });

    await expect(loadConfig(tempDir)).resolves.toEqual({
      terminalBackend: "wezterm"
    });
  });

  it("saves config JSON under the config directory", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "seiton-config-"));

    await saveConfig(tempDir, { terminalBackend: "wezterm" });

    const raw = await readFile(join(tempDir, "config.json"), "utf8");
    expect(JSON.parse(raw)).toEqual({ terminalBackend: "wezterm" });
  });
});
