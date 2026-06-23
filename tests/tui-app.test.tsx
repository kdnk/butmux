import { describe, expect, it } from "vitest";
import { renderToString } from "ink";
import { TuiApp } from "../src/tui/App";
import type { AppService, AppState } from "../src/core/app-service";

const emptyState: AppState = {
  projectsWithContexts: [],
  warnings: []
};

const service: AppService = {
  refresh: async () => emptyState,
  sync: async () => ({ ...emptyState, commands: [] }),
  syncProject: async () => ({ ...emptyState, commands: [] }),
  addProjectRoot: async () => emptyState,
  removeProjectRoot: async () => emptyState,
  createBranch: async () => ({ ...emptyState, commands: [], branchName: "branch" }),
  createWorkspaceSession: async () => emptyState,
  focusContext: async () => {},
  focusWorkspaceSession: async () => {},
  renameContext: async () => emptyState,
  removeOrphan: async () => emptyState,
  reorderProjects: async () => emptyState,
  reorderContexts: async () => emptyState,
  getSettings: async () => ({ terminalBackend: "kitty" }),
  updateSettings: async (input) => ({ terminalBackend: input.terminalBackend ?? "kitty" })
};

describe("TuiApp", () => {
  it("does not repeat the app name inside the header frame", () => {
    const output = renderToString(<TuiApp service={service} />, { columns: 120 });
    const headerContentLine = output
      .split("\n")
      .find((line) => line.includes("r refresh"));

    expect(output).toContain("[0]-butmux");
    expect(headerContentLine).toBeDefined();
    expect(headerContentLine).not.toContain("butmux");
  });
});
