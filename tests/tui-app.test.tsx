import { describe, expect, it } from "vitest";
import { renderToString } from "ink";
import { PromptView, TuiApp } from "../src/tui/App";
import type { AppService, AppState } from "../src/core/app-service";
import type { Context, ProjectContexts, WorkspaceSession } from "../src/core/model";

const emptyState: AppState = {
  projectsWithContexts: [],
  warnings: []
};

const service: AppService = {
  loadCachedState: async () => emptyState,
  refresh: async () => emptyState,
  sync: async () => ({ ...emptyState, commands: [] }),
  syncProject: async () => ({ ...emptyState, commands: [] }),
  addProjectRoot: async () => emptyState,
  removeProjectRoot: async () => emptyState,
  createBranch: async () => ({ ...emptyState, commands: [], branchName: "branch" }),
  setupGitButlerProject: async () => emptyState,
  teardownGitButlerWorkspace: async () => emptyState,
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

const context: Context = {
  id: "ctx-main",
  type: "managed",
  projectRoot: "/repo/a",
  branch: "feature/main",
  branchKey: "feature%2Fmain",
  branchId: "branch-id",
  tmuxSession: "bm_feature%2Fmain",
  terminalTabTitle: "bm_feature%2Fmain",
  agentPanes: [],
  order: 10,
  status: "ready"
};

const cachedWorkspace: WorkspaceSession = {
  type: "workspace",
  projectRoot: "/repo/a",
  name: "a",
  terminalTabTitle: "a",
  agentPanes: [],
  status: "loading"
};

const cachedProject: ProjectContexts = {
  project: {
    root: "/repo/a",
    name: "a",
    projectKey: "%2Frepo%2Fa",
    order: 10,
    enabled: true
  },
  workspaceSession: cachedWorkspace,
  contexts: [
    {
      ...context,
      status: "loading"
    }
  ],
  warnings: []
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

  it("renders the initial cached state before the first refresh completes", () => {
    const output = renderToString(
      <TuiApp service={service} initialState={{ projectsWithContexts: [cachedProject], warnings: [] }} />,
      { columns: 120 }
    );

    expect(output).toContain("/repo/a");
    expect(output).toContain("feature/main");
    expect(output).toContain("loading");
    expect(output).not.toContain("No projects");
  });

  it("renders a visible cursor marker for editable prompts", () => {
    const output = renderToString(
      <PromptView prompt={{ type: "rename-context", value: "feature/main", context }} />,
      { columns: 80 }
    );

    expect(output).toContain("New branch: feature/main▌");
  });
});
