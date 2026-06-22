import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, saveConfig } from "../src/core/config";
import { resolveButmuxPaths } from "../src/core/paths";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("resolveButmuxPaths", () => {
  it("uses XDG config and state directories when provided", () => {
    expect(resolveButmuxPaths(
      { XDG_CONFIG_HOME: "/cfg", XDG_STATE_HOME: "/state" },
      "linux",
      "/home/tester"
    )).toEqual({
      configDir: "/cfg/butmux",
      stateDir: "/state/butmux"
    });
  });

  it("falls back to home config and state directories", () => {
    expect(resolveButmuxPaths({}, "darwin", "/Users/tester")).toEqual({
      configDir: "/Users/tester/.config/butmux",
      stateDir: "/Users/tester/.local/state/butmux"
    });
  });
});

describe("config persistence", () => {
  it("defaults to kitty when config is missing", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "butmux-config-"));

    await expect(loadConfig(tempDir)).resolves.toEqual({
      terminalBackend: "kitty"
    });
  });

  it("loads wezterm when configured", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "butmux-config-"));
    await saveConfig(tempDir, { terminalBackend: "wezterm" });

    await expect(loadConfig(tempDir)).resolves.toEqual({
      terminalBackend: "wezterm"
    });
  });

  it("saves config JSON under the config directory", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "butmux-config-"));

    await saveConfig(tempDir, { terminalBackend: "wezterm" });

    const raw = await readFile(join(tempDir, "config.json"), "utf8");
    expect(JSON.parse(raw)).toEqual({ terminalBackend: "wezterm" });
  });
});
