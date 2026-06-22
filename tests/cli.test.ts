import { describe, expect, it, vi } from "vitest";
import { runCli, shouldRunCliMain } from "../src/cli";
import type { Registry } from "../src/core/model";

function createDeps(overrides: Partial<Parameters<typeof runCli>[1]> = {}) {
  const saved: { appDataDir: string; registry: Registry }[] = [];
  const outputs = { stdout: [] as string[], stderr: [] as string[] };
  const deps: Parameters<typeof runCli>[1] = {
    cwd: "/repo/a",
    env: { HOME: "/Users/tester", XDG_STATE_HOME: "/tmp/butmux-state", XDG_CONFIG_HOME: "/tmp/butmux-config" },
    platform: "darwin",
    home: "/Users/tester",
    readStdin: vi.fn().mockResolvedValue(""),
    applyAgentHook: vi.fn().mockResolvedValue(undefined),
    notifyCurrentPane: vi.fn().mockResolvedValue(undefined),
    loadRegistry: vi.fn().mockResolvedValue({ projects: [], contexts: [] }),
    saveRegistry: vi.fn().mockImplementation(async (appDataDir, registry) => {
      saved.push({ appDataDir, registry });
    }),
    emitLiveUpdate: vi.fn().mockResolvedValue(undefined),
    renderTui: vi.fn().mockResolvedValue(undefined),
    stdout: { write: (line: string) => void outputs.stdout.push(line) },
    stderr: { write: (line: string) => void outputs.stderr.push(line) }
  };
  return { deps: { ...deps, ...overrides }, saved, outputs };
}

describe("runCli", () => {
  it("starts the TUI when no subcommand is provided", async () => {
    const { deps } = createDeps();

    const exitCode = await runCli(["node", "butmux"], deps);

    expect(exitCode).toBe(0);
    expect(deps.renderTui).toHaveBeenCalledWith({
      configDir: "/tmp/butmux-config/butmux",
      stateDir: "/tmp/butmux-state/butmux"
    });
  });

  it("treats symlinked entrypoints as direct CLI execution", () => {
    expect(shouldRunCliMain(
      "/Users/kodai/.local/bin/butmux",
      "file:///Users/kodai/workspaces/github.com/kdnk/butmux/dist/cli.js",
      (path) => (
        path === "/Users/kodai/.local/bin/butmux"
          ? "/Users/kodai/workspaces/github.com/kdnk/butmux/dist/cli.js"
          : path
      )
    )).toBe(true);
  });

  it("adds the current working directory for butmux open", async () => {
    const { deps, saved, outputs } = createDeps();

    const exitCode = await runCli(["node", "butmux", "open"], deps);

    expect(exitCode).toBe(0);
    expect(deps.loadRegistry).toHaveBeenCalledWith("/tmp/butmux-state/butmux");
    expect(deps.saveRegistry).toHaveBeenCalledTimes(1);
    expect(saved[0]).toMatchObject({
      appDataDir: "/tmp/butmux-state/butmux",
      registry: {
        projects: [
          expect.objectContaining({
            root: "/repo/a",
            name: "a",
            enabled: true
          })
        ]
      }
    });
    expect(deps.emitLiveUpdate).toHaveBeenCalledWith({
      agent: "butmux",
      event: "open",
      paneId: "cli",
      cwd: "/repo/a"
    });
    expect(outputs.stdout.join("")).toContain("Opened /repo/a in butmux.");
  });

  it("does not add the filesystem root as a project", async () => {
    const { deps, outputs } = createDeps({
      cwd: "/"
    });

    const exitCode = await runCli(["node", "butmux", "open"], deps);

    expect(exitCode).toBe(1);
    expect(deps.saveRegistry).not.toHaveBeenCalled();
    expect(deps.emitLiveUpdate).not.toHaveBeenCalled();
    expect(outputs.stderr.join("")).toContain("Refusing to add filesystem root as a project: /");
  });

  it("prints a message when the project already exists", async () => {
    const { deps, outputs } = createDeps({
      loadRegistry: vi.fn().mockResolvedValue({
        projects: [
          {
            root: "/repo/a",
            name: "a",
            projectKey: "%2Frepo%2Fa",
            order: 10,
            enabled: true
          }
        ],
        contexts: []
      })
    });

    const exitCode = await runCli(["node", "butmux", "open"], deps);

    expect(exitCode).toBe(0);
    expect(deps.saveRegistry).not.toHaveBeenCalled();
    expect(deps.emitLiveUpdate).not.toHaveBeenCalled();
    expect(outputs.stdout.join("")).toContain("Project already exists in butmux: /repo/a");
  });

  it("keeps the hook command behavior", async () => {
    const { deps } = createDeps({
      readStdin: vi.fn().mockResolvedValue("{\"ok\":true}")
    });

    const exitCode = await runCli(["node", "butmux", "hook", "agent-1", "finish"], deps);

    expect(exitCode).toBe(0);
    expect(deps.applyAgentHook).toHaveBeenCalledWith(
      "agent-1",
      "finish",
      "{\"ok\":true}",
      deps.env,
      "/repo/a"
    );
  });

  it("accepts butmux notify and routes it into pane state", async () => {
    const notifyCurrentPane = vi.fn().mockResolvedValue(undefined);
    const { deps } = createDeps({
      notifyCurrentPane
    });

    const exitCode = await runCli(["node", "butmux", "notify", "implementation", "finished"], deps);

    expect(exitCode).toBe(0);
    expect(notifyCurrentPane).toHaveBeenCalledWith("implementation finished", deps.env, "/repo/a");
  });

  it("prints usage for unsupported commands", async () => {
    const { deps, outputs } = createDeps();

    const exitCode = await runCli(["node", "butmux", "unknown"], deps);

    expect(exitCode).toBe(1);
    expect(outputs.stderr.join("")).toContain("Usage: butmux hook <agent> <event>");
    expect(outputs.stderr.join("")).toContain("Usage: butmux notify <message>");
    expect(outputs.stderr.join("")).toContain("Usage: butmux open");
  });
});
