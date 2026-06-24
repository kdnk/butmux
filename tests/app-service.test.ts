import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppService, orderedProjectRoots } from "../src/core/app-service";
import { loadConfig } from "../src/core/config";
import { loadRegistry, saveRegistry } from "../src/core/registry";
import type { FullSystemSnapshot, SystemSnapshot } from "../src/core/commands";
import type { Registry, SyncCommand } from "../src/core/model";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

function emptyFullSnapshot(projectRoots: string[]): FullSystemSnapshot {
  return {
    projects: Object.fromEntries(projectRoots.map((root) => [root, { branches: [], warnings: [] }])),
    tmuxSessions: [],
    terminalTabs: [],
    agentPanesBySession: {},
    globalWarnings: []
  };
}

function emptySystemSnapshot(overrides: Partial<SystemSnapshot> = {}): SystemSnapshot {
  return {
    branches: [],
    tmuxSessions: [],
    terminalTabs: [],
    agentPanesBySession: {},
    warnings: [],
    ...overrides
  };
}

function fullSnapshotWithBranches(
  projectRoots: string[],
  branchesByRoot: Record<string, SystemSnapshot["branches"]>
): FullSystemSnapshot {
  return {
    ...emptyFullSnapshot(projectRoots),
    projects: Object.fromEntries(projectRoots.map((root) => [
      root,
      { branches: branchesByRoot[root] ?? [], warnings: [] }
    ]))
  };
}

async function createTempService(overrides: Partial<Parameters<typeof createAppService>[0]> = {}) {
  tempDir = await mkdtemp(join(tmpdir(), "butmux-service-"));
  const configDir = join(tempDir, "config");
  const stateDir = join(tempDir, "state");
  const readFullSystemSnapshot = vi.fn(async (roots: string[]) => emptyFullSnapshot(roots));
  const readSystemSnapshotForCwd = vi.fn(async () => emptySystemSnapshot());
  const applySyncCommand = vi.fn(async () => undefined);
  const runGitButlerModeCommand = vi.fn(async () => undefined);
  const service = createAppService({
    configDir,
    stateDir,
    now: () => "2026-06-22T00:00:00.000Z",
    readFullSystemSnapshot,
    readSystemSnapshotForCwd,
    applySyncCommand,
    runGitButlerModeCommand,
    focusContext: vi.fn(async () => undefined),
    focusWorkspaceSession: vi.fn(async () => undefined),
    createWorkspaceSession: vi.fn(async () => undefined),
    renameManagedContext: vi.fn(async () => undefined),
    removeOrphanContext: vi.fn(async () => undefined),
    ...overrides
  });
  return {
    service,
    configDir,
    stateDir,
    readFullSystemSnapshot,
    readSystemSnapshotForCwd,
    applySyncCommand,
    runGitButlerModeCommand
  };
}

describe("orderedProjectRoots", () => {
  it("returns project roots sorted by order", () => {
    const registry: Registry = {
      projects: [
        { root: "/repo/b", name: "b", projectKey: "%2Frepo%2Fb", order: 20, enabled: true },
        { root: "/repo/a", name: "a", projectKey: "%2Frepo%2Fa", order: 10, enabled: true }
      ],
      contexts: []
    };

    expect(orderedProjectRoots(registry)).toEqual(["/repo/a", "/repo/b"]);
  });
});

describe("createAppService", () => {
  it("reads and updates terminal backend settings from config", async () => {
    const { service, configDir } = await createTempService();

    await expect(service.getSettings()).resolves.toEqual({ terminalBackend: "kitty" });
    await expect(service.updateSettings({ terminalBackend: "wezterm" })).resolves.toEqual({ terminalBackend: "wezterm" });
    await expect(loadConfig(configDir)).resolves.toEqual({ terminalBackend: "wezterm" });
  });

  it("builds an immediate cached state from the registry without reading external system state", async () => {
    const { service, stateDir, readFullSystemSnapshot } = await createTempService();
    await saveRegistry(stateDir, {
      projects: [
        {
          root: "/repo/a",
          name: "a",
          projectKey: "%2Frepo%2Fa",
          order: 10,
          enabled: true
        }
      ],
      contexts: [
        {
          id: "ctx-a",
          projectRoot: "/repo/a",
          branch: "feature/a",
          branchKey: "feature%2Fa",
          tmuxSession: "bm_a_feature%2Fa",
          terminalTabTitle: "bm_a_feature%2Fa",
          order: 10,
          createdAt: "2026-06-22T00:00:00.000Z",
          updatedAt: "2026-06-22T00:00:00.000Z"
        }
      ]
    });

    const state = await service.loadCachedState();

    expect(readFullSystemSnapshot).not.toHaveBeenCalled();
    expect(state.warnings).toEqual([]);
    expect(state.projectsWithContexts[0]?.workspaceSession).toMatchObject({
      name: "a",
      status: "loading"
    });
    expect(state.projectsWithContexts[0]?.contexts).toEqual([
      expect.objectContaining({
        branch: "feature/a",
        status: "loading",
        agentPanes: []
      })
    ]);
  });

  it("adds a project root and refreshes app state", async () => {
    const { service, stateDir } = await createTempService();

    const state = await service.addProjectRoot("/repo/a");

    expect(state.projectsWithContexts).toHaveLength(1);
    expect(state.projectsWithContexts[0]?.project.root).toBe("/repo/a");
    await expect(loadRegistry(stateDir)).resolves.toMatchObject({
      projects: [expect.objectContaining({ root: "/repo/a", order: 10 })]
    });
  });

  it("removes a project root and its contexts", async () => {
    const { service, stateDir } = await createTempService();
    await service.addProjectRoot("/repo/a");

    const state = await service.removeProjectRoot("/repo/a");

    expect(state.projectsWithContexts).toEqual([]);
    await expect(loadRegistry(stateDir)).resolves.toEqual({ projects: [], contexts: [] });
  });

  it("runs GitButler setup for a project and refreshes app state", async () => {
    const runGitButlerModeCommand = vi.fn(async () => undefined);
    const { service } = await createTempService({ runGitButlerModeCommand });
    await service.addProjectRoot("/repo/a");

    await service.setupGitButlerProject("/repo/a");

    expect(runGitButlerModeCommand).toHaveBeenCalledWith("/repo/a", "setup");
  });

  it("runs GitButler teardown for a project and refreshes app state", async () => {
    const runGitButlerModeCommand = vi.fn(async () => undefined);
    const { service } = await createTempService({ runGitButlerModeCommand });
    await service.addProjectRoot("/repo/a");

    await service.teardownGitButlerWorkspace("/repo/a");

    expect(runGitButlerModeCommand).toHaveBeenCalledWith("/repo/a", "teardown");
  });

  it("persists project reorder", async () => {
    const { service, stateDir } = await createTempService();
    await service.addProjectRoot("/repo/a");
    await service.addProjectRoot("/repo/b");

    await service.reorderProjects(0, 1);

    await expect(loadRegistry(stateDir)).resolves.toMatchObject({
      projects: [
        expect.objectContaining({ root: "/repo/b", order: 10 }),
        expect.objectContaining({ root: "/repo/a", order: 20 })
      ]
    });
  });

  it("persists context reorder within one project", async () => {
    const { service, stateDir } = await createTempService();
    await saveRegistry(stateDir, {
      projects: [
        { root: "/repo/a", name: "a", projectKey: "%2Frepo%2Fa", order: 10, enabled: true }
      ],
      contexts: [
        {
          id: "ctx-a",
          projectRoot: "/repo/a",
          branch: "a",
          branchKey: "a",
          tmuxSession: "bm_a_a",
          terminalTabTitle: "bm_a_a",
          order: 10,
          createdAt: "2026-06-22T00:00:00.000Z",
          updatedAt: "2026-06-22T00:00:00.000Z"
        },
        {
          id: "ctx-b",
          projectRoot: "/repo/a",
          branch: "b",
          branchKey: "b",
          tmuxSession: "bm_a_b",
          terminalTabTitle: "bm_a_b",
          order: 20,
          createdAt: "2026-06-22T00:00:00.000Z",
          updatedAt: "2026-06-22T00:00:00.000Z"
        }
      ]
    });

    await service.reorderContexts("/repo/a", 0, 1);

    await expect(loadRegistry(stateDir)).resolves.toMatchObject({
      contexts: [
        expect.objectContaining({ id: "ctx-b", order: 10 }),
        expect.objectContaining({ id: "ctx-a", order: 20 })
      ]
    });
  });

  it("rejects empty context rename before calling commands", async () => {
    const { service } = await createTempService();

    await expect(service.renameContext({
      contextId: "ctx-a",
      projectRoot: "/repo/a",
      oldBranch: "feature/a",
      oldTmuxSession: "bm_a_feature%2Fa",
      oldTerminalTabTitle: "bm_a_feature%2Fa",
      newBranch: " "
    })).rejects.toThrow("Branch name cannot be empty");
  });

  it("continues sync after command failures and returns project warnings", async () => {
    const { service, readSystemSnapshotForCwd, applySyncCommand } = await createTempService();
    await service.addProjectRoot("/repo/a");
    const command: SyncCommand = {
      type: "create_tmux_session",
      branch: "feature/a",
      tmuxSession: "bm_a_feature%2Fa"
    };
    readSystemSnapshotForCwd.mockResolvedValueOnce(emptySystemSnapshot({
      branches: [{ name: "feature/a" }]
    }));
    applySyncCommand.mockRejectedValueOnce(new Error("tmux failed"));

    const state = await service.sync();

    expect(state.commands).toContainEqual(command);
    expect(state.projectsWithContexts[0]?.warnings).toContain("create_tmux_session failed: tmux failed");
  });

  it("creates an independent GitButler branch and syncs the project", async () => {
    const createGitButlerBranch = vi.fn(async () => undefined);
    const { service, readFullSystemSnapshot, readSystemSnapshotForCwd, applySyncCommand } = await createTempService({
      createGitButlerBranch
    });
    await service.addProjectRoot("/repo/a");
    readSystemSnapshotForCwd.mockResolvedValueOnce(emptySystemSnapshot());
    readSystemSnapshotForCwd.mockResolvedValueOnce(emptySystemSnapshot({
      branches: [{ name: "feature/new-work" }]
    }));
    readFullSystemSnapshot.mockImplementation(async (roots: string[]) =>
      fullSnapshotWithBranches(roots, { "/repo/a": [{ name: "feature/new-work" }] })
    );

    const state = await service.createBranch({
      projectRoot: "/repo/a",
      name: " feature/new-work "
    });

    expect(createGitButlerBranch).toHaveBeenCalledWith({
      projectRoot: "/repo/a",
      name: "feature/new-work"
    });
    expect(state.branchName).toBe("feature/new-work");
    expect(state.projectsWithContexts[0]?.contexts[0]).toMatchObject({
      branch: "feature/new-work",
      status: "missing_tmux"
    });
    expect(state.commands).toContainEqual({
      type: "create_tmux_session",
      branch: "feature/new-work",
      tmuxSession: "bm_a_feature%2Fnew-work"
    });
    expect(applySyncCommand).toHaveBeenCalled();
  });

  it("creates a dependent GitButler branch with an anchor", async () => {
    const createGitButlerBranch = vi.fn(async () => undefined);
    const { service, readFullSystemSnapshot, readSystemSnapshotForCwd } = await createTempService({
      createGitButlerBranch
    });
    await service.addProjectRoot("/repo/a");
    readSystemSnapshotForCwd.mockResolvedValueOnce(emptySystemSnapshot());
    readSystemSnapshotForCwd.mockResolvedValueOnce(emptySystemSnapshot({
      branches: [{ name: "feature/child" }]
    }));
    readFullSystemSnapshot.mockImplementation(async (roots: string[]) =>
      fullSnapshotWithBranches(roots, { "/repo/a": [{ name: "feature/child" }] })
    );

    const state = await service.createBranch({
      projectRoot: "/repo/a",
      name: "feature/child",
      anchor: "feature/base"
    });

    expect(createGitButlerBranch).toHaveBeenCalledWith({
      projectRoot: "/repo/a",
      name: "feature/child",
      anchor: "feature/base"
    });
    expect(state.branchName).toBe("feature/child");
  });

  it("rejects empty and duplicate branch names before creating a branch", async () => {
    const createGitButlerBranch = vi.fn(async () => undefined);
    const { service, readSystemSnapshotForCwd } = await createTempService({
      createGitButlerBranch
    });
    await service.addProjectRoot("/repo/a");

    await expect(service.createBranch({
      projectRoot: "/repo/a",
      name: " "
    })).rejects.toThrow("Branch name cannot be empty");
    expect(createGitButlerBranch).not.toHaveBeenCalled();

    readSystemSnapshotForCwd.mockResolvedValueOnce(emptySystemSnapshot({
      branches: [{ name: "feature/existing" }]
    }));
    await expect(service.createBranch({
      projectRoot: "/repo/a",
      name: "feature/existing"
    })).rejects.toThrow("Branch already exists: feature/existing");
    expect(createGitButlerBranch).not.toHaveBeenCalled();
  });
});
