import {
  applySyncCommand as applySyncCommandDefault,
  createGitButlerBranch as createGitButlerBranchDefault,
  createWorkspaceSession as createWorkspaceSessionDefault,
  focusContext as focusContextDefault,
  focusWorkspaceSession as focusWorkspaceSessionDefault,
  getTerminalBackend,
  readFullSystemSnapshot as readFullSystemSnapshotDefault,
  readSystemSnapshotForCwd as readSystemSnapshotForCwdDefault,
  removeOrphanContext as removeOrphanContextDefault,
  renameManagedContext as renameManagedContextDefault,
  type CreateGitButlerBranchInput,
  type FullSystemSnapshot,
  type RemoveOrphanInput,
  type SystemSnapshot
} from "./commands";
import {
  buildBranchKey,
  buildManagedName,
  detectAllContexts,
  ensureProject,
  planSync,
  reconcileRegistry,
  removeProject,
  type Branch,
  type ProjectContexts,
  type Registry,
  type SyncCommand,
  type TerminalBackendName
} from "./model";
import type { TerminalBackend } from "./terminal-backend";
import { loadConfig, normalizeConfig, saveConfig, type ButmuxConfig } from "./config";
import { loadRegistry, saveRegistry } from "./registry";

export type AppState = {
  projectsWithContexts: ProjectContexts[];
  warnings: string[];
};

export type RenameContextInput = {
  contextId: string;
  projectRoot: string;
  branchId?: string;
  oldBranch: string;
  oldTmuxSession: string;
  oldTerminalTabTitle: string;
  newBranch: string;
};

export type CreateBranchInput = {
  projectRoot: string;
  name: string;
  anchor?: string;
};

export type AppService = {
  refresh(): Promise<AppState>;
  sync(): Promise<AppState & { commands: SyncCommand[] }>;
  syncProject(root: string): Promise<AppState & { commands: SyncCommand[] }>;
  addProjectRoot(root: string): Promise<AppState>;
  removeProjectRoot(root: string): Promise<AppState>;
  createBranch(input: CreateBranchInput): Promise<AppState & { commands: SyncCommand[]; branchName: string }>;
  createWorkspaceSession(projectRoot: string): Promise<AppState>;
  focusContext(input: { projectRoot: string; branchKey: string; paneId?: string }): Promise<void>;
  focusWorkspaceSession(input: { projectRoot: string; paneId?: string }): Promise<void>;
  renameContext(input: RenameContextInput): Promise<AppState>;
  removeOrphan(input: RemoveOrphanInput): Promise<AppState>;
  reorderProjects(from: number, to: number): Promise<AppState>;
  reorderContexts(projectRoot: string, from: number, to: number): Promise<AppState>;
  getSettings(): Promise<ButmuxConfig>;
  updateSettings(input: Partial<ButmuxConfig>): Promise<ButmuxConfig>;
};

export type AppServiceDeps = {
  readFullSystemSnapshot: (
    projectRoots: string[],
    backend?: TerminalBackend
  ) => Promise<FullSystemSnapshot>;
  readSystemSnapshotForCwd: (
    cwd: string,
    backend?: TerminalBackend
  ) => Promise<SystemSnapshot>;
  applySyncCommand: (
    command: SyncCommand,
    cwd?: string,
    backend?: TerminalBackend
  ) => Promise<void>;
  focusContext: typeof focusContextDefault;
  focusWorkspaceSession: typeof focusWorkspaceSessionDefault;
  createWorkspaceSession: typeof createWorkspaceSessionDefault;
  createGitButlerBranch: (input: CreateGitButlerBranchInput) => Promise<void>;
  renameManagedContext: typeof renameManagedContextDefault;
  removeOrphanContext: typeof removeOrphanContextDefault;
};

export type CreateAppServiceOptions = Partial<AppServiceDeps> & {
  configDir: string;
  stateDir: string;
  now?: () => string;
};

type ProjectWarningMap = Record<string, string[]>;

export function createAppService(options: CreateAppServiceOptions): AppService {
  const deps: AppServiceDeps = {
    readFullSystemSnapshot: options.readFullSystemSnapshot ?? readFullSystemSnapshotDefault,
    readSystemSnapshotForCwd: options.readSystemSnapshotForCwd ?? readSystemSnapshotForCwdDefault,
    applySyncCommand: options.applySyncCommand ?? applySyncCommandDefault,
    focusContext: options.focusContext ?? focusContextDefault,
    focusWorkspaceSession: options.focusWorkspaceSession ?? focusWorkspaceSessionDefault,
    createWorkspaceSession: options.createWorkspaceSession ?? createWorkspaceSessionDefault,
    createGitButlerBranch: options.createGitButlerBranch ?? createGitButlerBranchDefault,
    renameManagedContext: options.renameManagedContext ?? renameManagedContextDefault,
    removeOrphanContext: options.removeOrphanContext ?? removeOrphanContextDefault
  };
  const readNow = options.now ?? (() => new Date().toISOString());

  async function readBackend(): Promise<TerminalBackend> {
    return getTerminalBackend(readTerminalBackendSetting(await loadConfig(options.configDir)));
  }

  async function getFullState(): Promise<AppState> {
    const registry = await loadRegistry(options.stateDir);
    const snapshot = await deps.readFullSystemSnapshot(orderedProjectRoots(registry), await readBackend());
    return buildAppState(registry, snapshot);
  }

  async function reconcileAndPersistRegistry(
    registry: Registry,
    projectRoot: string,
    branches: Branch[]
  ): Promise<Registry> {
    const registryWithProject = ensureProject({
      registry,
      root: projectRoot,
      now: readNow()
    });
    const next = reconcileRegistry({
      projectRoot,
      branches,
      registry: registryWithProject,
      now: readNow()
    });
    if (JSON.stringify(next) !== JSON.stringify(registry)) {
      await saveRegistry(options.stateDir, next);
    }
    return next;
  }

  async function reconcileRegistryForAllProjects(
    registry: Registry,
    projects: Record<string, { branches: Branch[]; warnings: string[] }>
  ): Promise<Registry> {
    let nextRegistry = registry;
    for (const projectRoot of orderedProjectRoots(registry)) {
      nextRegistry = await reconcileAndPersistRegistry(
        nextRegistry,
        projectRoot,
        projects[projectRoot]?.branches ?? []
      );
    }
    return nextRegistry;
  }

  async function getReconciledFullState(): Promise<AppState> {
    const loadedRegistry = await loadRegistry(options.stateDir);
    const backend = await readBackend();
    const snapshot = await deps.readFullSystemSnapshot(orderedProjectRoots(loadedRegistry), backend);
    const registry = await reconcileRegistryForAllProjects(loadedRegistry, snapshot.projects);
    const projectRoots = orderedProjectRoots(registry);
    const nextSnapshot =
      projectRoots.length === orderedProjectRoots(loadedRegistry).length
        ? snapshot
        : await deps.readFullSystemSnapshot(projectRoots, backend);
    return buildAppState(registry, nextSnapshot);
  }

  async function syncProjectRoot(
    projectRoot: string,
    sourceRegistry?: Registry
  ): Promise<{ registry: Registry; commands: SyncCommand[]; projectWarnings: string[] }> {
    const loadedRegistry = sourceRegistry ?? await loadRegistry(options.stateDir);
    const backend = await readBackend();
    const snapshot = await deps.readSystemSnapshotForCwd(projectRoot, backend);
    const registry = await reconcileAndPersistRegistry(loadedRegistry, projectRoot, snapshot.branches);
    const plan = planSync({ ...snapshot, registry, projectRoot });
    const projectWarnings = [...snapshot.warnings, ...plan.warnings];

    for (const command of plan.commands) {
      try {
        await deps.applySyncCommand(command, projectRoot, backend);
      } catch (error) {
        projectWarnings.push(`${command.type} failed: ${formatError(error)}`);
      }
    }

    let nextRegistry = registry;
    if (plan.registryUpdates.length > 0) {
      nextRegistry = {
        ...registry,
        contexts: registry.contexts.map((context) => {
          const update = plan.registryUpdates.find((candidate) => candidate.id === context.id);
          return update ?? context;
        })
      };
      await saveRegistry(options.stateDir, nextRegistry);
    }

    return { registry: nextRegistry, commands: plan.commands, projectWarnings };
  }

  return {
    async refresh() {
      return await getReconciledFullState();
    },

    async sync() {
      let registry = await loadRegistry(options.stateDir);
      const commands: SyncCommand[] = [];
      const extraProjectWarnings: ProjectWarningMap = {};

      for (const projectRoot of orderedProjectRoots(registry)) {
        const result = await syncProjectRoot(projectRoot, registry);
        registry = result.registry;
        commands.push(...result.commands);
        if (result.projectWarnings.length > 0) {
          extraProjectWarnings[projectRoot] = result.projectWarnings;
        }
      }

      const state = buildAppState(
        registry,
        await deps.readFullSystemSnapshot(orderedProjectRoots(registry), await readBackend()),
        extraProjectWarnings
      );
      return { ...state, commands };
    },

    async syncProject(root: string) {
      const result = await syncProjectRoot(root);
      const state = buildAppState(
        result.registry,
        await deps.readFullSystemSnapshot(orderedProjectRoots(result.registry), await readBackend()),
        { [root]: result.projectWarnings }
      );
      return { ...state, commands: result.commands };
    },

    async addProjectRoot(root: string) {
      const registry = ensureProject({
        registry: await loadRegistry(options.stateDir),
        root,
        now: readNow()
      });
      await saveRegistry(options.stateDir, registry);
      return await getReconciledFullState();
    },

    async removeProjectRoot(root: string) {
      const registry = await loadRegistry(options.stateDir);
      await saveRegistry(options.stateDir, removeProject({ registry, root }));
      return await getFullState();
    },

    async createBranch(input) {
      const branchName = input.name.trim();
      if (!branchName) {
        throw new Error("Branch name cannot be empty");
      }

      const backend = await readBackend();
      const snapshot = await deps.readSystemSnapshotForCwd(input.projectRoot, backend);
      if (snapshot.branches.some((branch) => branch.name === branchName)) {
        throw new Error(`Branch already exists: ${branchName}`);
      }

      const anchor = input.anchor?.trim();
      await deps.createGitButlerBranch({
        projectRoot: input.projectRoot,
        name: branchName,
        ...(anchor ? { anchor } : {})
      });

      const result = await syncProjectRoot(input.projectRoot);
      const state = buildAppState(
        result.registry,
        await deps.readFullSystemSnapshot(orderedProjectRoots(result.registry), await readBackend()),
        { [input.projectRoot]: result.projectWarnings }
      );
      return { ...state, commands: result.commands, branchName };
    },

    async createWorkspaceSession(projectRoot: string) {
      const backend = await readBackend();
      await deps.createWorkspaceSession(projectRoot, projectRoot, undefined, backend);
      await deps.focusWorkspaceSession(projectRoot, undefined, projectRoot, undefined, backend);
      return await getFullState();
    },

    async focusContext(input) {
      const backend = await readBackend();
      await deps.focusContext(input.projectRoot, input.branchKey, input.paneId, input.projectRoot, undefined, backend);
    },

    async focusWorkspaceSession(input) {
      const backend = await readBackend();
      await deps.focusWorkspaceSession(input.projectRoot, input.paneId, input.projectRoot, undefined, backend);
    },

    async renameContext(input) {
      const nextBranch = input.newBranch.trim();
      if (nextBranch.length === 0) {
        throw new Error("Branch name cannot be empty");
      }
      if (nextBranch === input.oldBranch) {
        return await getFullState();
      }

      const registry = await loadRegistry(options.stateDir);
      const backend = await readBackend();
      const snapshot = await deps.readSystemSnapshotForCwd(input.projectRoot, backend);
      const nextManagedName = buildManagedName(input.projectRoot, nextBranch);

      if (snapshot.branches.some((branch) => branch.name === nextBranch && branch.name !== input.oldBranch)) {
        throw new Error(`Branch already exists: ${nextBranch}`);
      }
      if (snapshot.tmuxSessions.includes(nextManagedName) && input.oldTmuxSession !== nextManagedName) {
        throw new Error(`tmux session already exists: ${nextManagedName}`);
      }
      if (
        snapshot.terminalTabs.some((tab) => tab.title === nextManagedName) &&
        input.oldTerminalTabTitle !== nextManagedName
      ) {
        throw new Error(`terminal tab already exists: ${nextManagedName}`);
      }

      const oldTerminalTabId = snapshot.terminalTabs.find((tab) => tab.title === input.oldTerminalTabTitle)?.id;
      const renameInput = {
        projectRoot: input.projectRoot,
        oldBranch: input.oldBranch,
        newBranch: nextBranch,
        oldTmuxSession: input.oldTmuxSession,
        oldTerminalTabTitle: input.oldTerminalTabTitle,
        ...(oldTerminalTabId !== undefined ? { oldTerminalTabId } : {}),
        ...(input.branchId ? { branchId: input.branchId } : {})
      };
      await deps.renameManagedContext(renameInput, input.projectRoot, undefined, backend);

      const nextRegistry: Registry = {
        ...registry,
        contexts: registry.contexts.map((context) =>
          context.id === input.contextId
            ? {
                ...context,
                branch: nextBranch,
                branchKey: buildBranchKey(nextBranch),
                tmuxSession: nextManagedName,
                terminalTabTitle: nextManagedName,
                updatedAt: readNow()
              }
            : context
        )
      };
      await saveRegistry(options.stateDir, nextRegistry);
      return await getFullState();
    },

    async removeOrphan(input) {
      await deps.removeOrphanContext(input, input.projectRoot, undefined, await readBackend());
      return await getFullState();
    },

    async reorderProjects(from: number, to: number) {
      const registry = await loadRegistry(options.stateDir);
      const projects = [...(registry.projects ?? [])].sort((a, b) => a.order - b.order);
      const [item] = projects.splice(from, 1);
      if (item) {
        projects.splice(to, 0, item);
        projects.forEach((project, index) => {
          project.order = (index + 1) * 10;
        });
        await saveRegistry(options.stateDir, { ...registry, projects });
      }
      return await getFullState();
    },

    async reorderContexts(projectRoot: string, from: number, to: number) {
      const registry = await loadRegistry(options.stateDir);
      const contexts = registry.contexts
        .filter((context) => context.projectRoot === projectRoot)
        .sort((a, b) => a.order - b.order);
      const [item] = contexts.splice(from, 1);
      if (item) {
        contexts.splice(to, 0, item);
        contexts.forEach((context, index) => {
          context.order = (index + 1) * 10;
        });
        const otherContexts = registry.contexts.filter((context) => context.projectRoot !== projectRoot);
        await saveRegistry(options.stateDir, { ...registry, contexts: [...otherContexts, ...contexts] });
      }
      return await getFullState();
    },

    async getSettings() {
      return await loadConfig(options.configDir);
    },

    async updateSettings(input) {
      const current = await loadConfig(options.configDir);
      const next = normalizeConfig({ ...current, ...input });
      await saveConfig(options.configDir, next);
      return next;
    }
  };
}

export function orderedProjectRoots(registry: Registry): string[] {
  return [...(registry.projects ?? [])]
    .sort((a, b) => a.order - b.order)
    .map((project) => project.root);
}

export function buildAppState(
  registry: Registry,
  snapshot: FullSystemSnapshot,
  extraProjectWarnings: ProjectWarningMap = {}
): AppState {
  return {
    projectsWithContexts: detectAllContexts(registry, snapshot).map((projectWithContexts) => ({
      ...projectWithContexts,
      warnings: [
        ...(projectWithContexts.warnings ?? []),
        ...(extraProjectWarnings[projectWithContexts.project.root] ?? [])
      ]
    })),
    warnings: snapshot.globalWarnings
  };
}

export function readTerminalBackendSetting(config: ButmuxConfig): TerminalBackendName {
  return config.terminalBackend === "wezterm" ? "wezterm" : "kitty";
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
