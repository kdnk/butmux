import { useEffect, useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import type { AppService, AppState } from "../core/app-service";
import { watchLiveUpdates } from "../core/live-updates";
import type { AgentPane, Context, ProjectContexts, WorkspaceSession } from "../core/model";
import { helpRows } from "./keymap";
import { startDebouncedLiveRefresh } from "./live-refresh";
import { clampSelection, moveSelection, switchPane, toReorderIntent, type TuiPane } from "./state";

type PromptState =
  | { type: "add-project"; value: string }
  | { type: "rename-context"; value: string; context: Context }
  | { type: "confirm-remove-project"; projectRoot: string }
  | { type: "confirm-remove-orphan"; context: Context };

type ContextRow =
  | { type: "workspace"; label: string; workspace: WorkspaceSession }
  | { type: "workspace-missing"; label: string; projectRoot: string }
  | { type: "context"; label: string; context: Context };

const emptyState: AppState = {
  projectsWithContexts: [],
  warnings: []
};

export function TuiApp({ service }: { service: AppService }) {
  const { exit } = useApp();
  const [state, setState] = useState<AppState>(emptyState);
  const [pane, setPane] = useState<TuiPane>("projects");
  const [projectIndex, setProjectIndex] = useState(0);
  const [contextIndex, setContextIndex] = useState(0);
  const [busy, setBusy] = useState<string | undefined>("loading");
  const [error, setError] = useState<string | undefined>();
  const [lastSync, setLastSync] = useState<string | undefined>();
  const [helpOpen, setHelpOpen] = useState(false);
  const [prompt, setPrompt] = useState<PromptState | undefined>();

  const selectedProject = state.projectsWithContexts[projectIndex];
  const contextRows = useMemo(() => buildContextRows(selectedProject), [selectedProject]);
  const selectedContextRow = contextRows[contextIndex];

  async function runAction(label: string, action: () => Promise<AppState | void>) {
    setBusy(label);
    setError(undefined);
    try {
      const next = await action();
      if (next) setState(next);
    } catch (actionError) {
      setError(formatError(actionError));
    } finally {
      setBusy(undefined);
    }
  }

  async function refresh() {
    await runAction("refreshing", async () => await service.refresh());
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    return startDebouncedLiveRefresh(watchLiveUpdates, () => {
      if (!busy) void refresh();
    });
  }, [busy]);

  useEffect(() => {
    setProjectIndex((current) => clampSelection(current, state.projectsWithContexts.length));
  }, [state.projectsWithContexts.length]);

  useEffect(() => {
    setContextIndex((current) => clampSelection(current, contextRows.length));
  }, [contextRows.length]);

  useInput((input, key) => {
    if (prompt) {
      void handlePromptInput(input, key);
      return;
    }

    if (input === "q" || key.ctrl && input === "c") {
      exit();
      return;
    }
    if (input === "?") {
      setHelpOpen((open) => !open);
      return;
    }
    if (key.leftArrow || input === "h") {
      setPane((current) => switchPane(current, "left"));
      return;
    }
    if (key.rightArrow || input === "l") {
      setPane((current) => switchPane(current, "right"));
      return;
    }
    if (key.upArrow || input === "k") {
      moveActiveSelection(-1);
      return;
    }
    if (key.downArrow || input === "j") {
      moveActiveSelection(1);
      return;
    }
    if (input === "r") {
      void refresh();
      return;
    }
    if (input === "s") {
      void syncSelectedProject();
      return;
    }
    if (input === "a") {
      setPrompt({ type: "add-project", value: "" });
      return;
    }
    if (input === "n") {
      if (selectedContextRow?.type === "context") {
        setPrompt({
          type: "rename-context",
          value: selectedContextRow.context.branch,
          context: selectedContextRow.context
        });
      }
      return;
    }
    if (input === "x") {
      if (pane === "projects" && selectedProject) {
        setPrompt({ type: "confirm-remove-project", projectRoot: selectedProject.project.root });
      } else if (selectedContextRow?.type === "context" && selectedContextRow.context.status === "orphan_tmux") {
        setPrompt({ type: "confirm-remove-orphan", context: selectedContextRow.context });
      }
      return;
    }
    if (input === "c") {
      if (selectedProject) {
        void runAction("creating workspace session", async () =>
          await service.createWorkspaceSession(selectedProject.project.root)
        );
      }
      return;
    }
    if (input === ",") {
      void cycleTerminalBackend();
      return;
    }
    if (input === "[" || input === "]") {
      void reorderSelected(input === "[" ? -1 : 1);
      return;
    }
    if (key.return) {
      void focusSelected();
    }
  });

  async function handlePromptInput(input: string, key: { escape?: boolean; return?: boolean; backspace?: boolean; delete?: boolean }) {
    if (!prompt) return;
    if (key.escape) {
      setPrompt(undefined);
      return;
    }
    if (key.backspace || key.delete) {
      if ("value" in prompt) setPrompt({ ...prompt, value: prompt.value.slice(0, -1) });
      return;
    }
    if (key.return) {
      await submitPrompt(prompt);
      return;
    }
    if ("value" in prompt && input) {
      setPrompt({ ...prompt, value: `${prompt.value}${input}` });
    }
  }

  async function submitPrompt(current: PromptState) {
    setPrompt(undefined);
    if (current.type === "add-project") {
      const root = current.value.trim();
      if (!root) return;
      await runAction("adding project", async () => await service.addProjectRoot(root));
      return;
    }
    if (current.type === "rename-context") {
      await runAction("renaming context", async () => await service.renameContext({
        contextId: current.context.id,
        projectRoot: current.context.projectRoot,
        oldBranch: current.context.branch,
        oldTmuxSession: current.context.tmuxSession,
        oldTerminalTabTitle: current.context.terminalTabTitle,
        newBranch: current.value,
        ...(current.context.branchId ? { branchId: current.context.branchId } : {})
      }));
      return;
    }
    if (current.type === "confirm-remove-project") {
      if (current.projectRoot && current.projectRoot !== "/") {
        await runAction("removing project", async () => await service.removeProjectRoot(current.projectRoot));
      }
      return;
    }
    await runAction("removing orphan", async () => await service.removeOrphan({
      projectRoot: current.context.projectRoot,
      tmuxSession: current.context.tmuxSession,
      terminalTabTitle: current.context.terminalTabTitle
    }));
  }

  function moveActiveSelection(delta: -1 | 1) {
    if (pane === "projects") {
      setProjectIndex((current) => moveSelection(current, delta, state.projectsWithContexts.length));
    } else {
      setContextIndex((current) => moveSelection(current, delta, contextRows.length));
    }
  }

  async function syncSelectedProject() {
    if (!selectedProject) return;
    await runAction("syncing", async () => {
      const next = await service.syncProject(selectedProject.project.root);
      setLastSync(`${next.commands.length} commands`);
      return next;
    });
  }

  async function cycleTerminalBackend() {
    await runAction("updating settings", async () => {
      const current = await service.getSettings();
      await service.updateSettings({
        terminalBackend: current.terminalBackend === "kitty" ? "wezterm" : "kitty"
      });
      return await service.refresh();
    });
  }

  async function reorderSelected(delta: -1 | 1) {
    if (pane === "projects") {
      const intent = toReorderIntent(pane, projectIndex, delta, state.projectsWithContexts.length);
      if (!intent) return;
      setProjectIndex(intent.to);
      await runAction("reordering projects", async () => await service.reorderProjects(intent.from, intent.to));
      return;
    }

    if (pane === "contexts" && selectedProject) {
      const managedOffset = contextRows.findIndex((row) => row.type === "context");
      if (managedOffset === -1 || contextIndex < managedOffset) return;
      const managedIndex = contextIndex - managedOffset;
      const managedCount = selectedProject.contexts.length;
      const intent = toReorderIntent("contexts", managedIndex, delta, managedCount);
      if (!intent) return;
      setContextIndex(managedOffset + intent.to);
      await runAction("reordering contexts", async () =>
        await service.reorderContexts(selectedProject.project.root, intent.from, intent.to)
      );
    }
  }

  async function focusSelected() {
    if (selectedContextRow?.type === "workspace") {
      await runAction("focusing workspace", async () => {
        await service.focusWorkspaceSession({
          projectRoot: selectedContextRow.workspace.projectRoot,
          ...(selectedContextRow.workspace.primaryPaneId ? { paneId: selectedContextRow.workspace.primaryPaneId } : {})
        });
      });
      return;
    }
    if (selectedContextRow?.type === "workspace-missing") {
      await runAction("creating workspace session", async () =>
        await service.createWorkspaceSession(selectedContextRow.projectRoot)
      );
      return;
    }
    if (selectedContextRow?.type === "context") {
      await runAction("focusing context", async () => {
        await service.focusContext({
          projectRoot: selectedContextRow.context.projectRoot,
          branchKey: selectedContextRow.context.branchKey,
          ...(selectedContextRow.context.primaryPaneId ? { paneId: selectedContextRow.context.primaryPaneId } : {})
        });
      });
    }
  }

  return (
    <Box flexDirection="column">
      <Header busy={busy} lastSync={lastSync} />
      {error ? <Text color="red">Error: {error}</Text> : null}
      <Box gap={2}>
        <ProjectsPane
          active={pane === "projects"}
          projects={state.projectsWithContexts}
          selectedIndex={projectIndex}
        />
        <ContextsPane
          active={pane === "contexts"}
          rows={contextRows}
          selectedIndex={contextIndex}
        />
        <DetailPane
          active={pane === "detail"}
          state={state}
          project={selectedProject}
          row={selectedContextRow}
        />
      </Box>
      {helpOpen ? <HelpOverlay /> : null}
      {prompt ? <PromptView prompt={prompt} /> : null}
    </Box>
  );
}

function Header({ busy, lastSync }: { busy: string | undefined; lastSync: string | undefined }) {
  return (
    <Box gap={2}>
      <Text bold color="cyan">butmux</Text>
      <Text dimColor>r refresh</Text>
      <Text dimColor>s sync</Text>
      <Text dimColor>a add</Text>
      <Text dimColor>? help</Text>
      {lastSync ? <Text color="green">{lastSync}</Text> : null}
      {busy ? <Text color="yellow">{busy}</Text> : null}
    </Box>
  );
}

function ProjectsPane({
  active,
  projects,
  selectedIndex
}: {
  active: boolean;
  projects: ProjectContexts[];
  selectedIndex: number;
}) {
  return (
    <Box flexDirection="column" width="25%">
      <Text bold color={active ? "cyan" : "white"}>Projects</Text>
      {projects.length === 0 ? <Text dimColor>No projects</Text> : null}
      {projects.map((project, index) => (
        <Text key={project.project.root} color={index === selectedIndex ? "cyan" : "white"}>
          {index === selectedIndex ? "> " : "  "}{project.project.name}
        </Text>
      ))}
    </Box>
  );
}

function ContextsPane({
  active,
  rows,
  selectedIndex
}: {
  active: boolean;
  rows: ContextRow[];
  selectedIndex: number;
}) {
  return (
    <Box flexDirection="column" width="40%">
      <Text bold color={active ? "cyan" : "white"}>Contexts</Text>
      {rows.length === 0 ? <Text dimColor>No contexts</Text> : null}
      {rows.map((row, index) => (
        <Text key={`${row.type}:${row.label}`} color={index === selectedIndex ? "cyan" : statusColor(row)}>
          {index === selectedIndex ? "> " : "  "}{row.label}
        </Text>
      ))}
    </Box>
  );
}

function DetailPane({
  active,
  state,
  project,
  row
}: {
  active: boolean;
  state: AppState;
  project: ProjectContexts | undefined;
  row: ContextRow | undefined;
}) {
  const panes = readAgentPanes(row);
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold color={active ? "cyan" : "white"}>Detail</Text>
      {state.warnings.map((warning, index) => (
        <Text key={`global-warning-${index}`} color="yellow">! {warning}</Text>
      ))}
      {project?.warnings?.map((warning, index) => (
        <Text key={`project-warning-${index}`} color="yellow">! {warning}</Text>
      ))}
      {row ? <Text>{detailTitle(row)}</Text> : <Text dimColor>No selection</Text>}
      {panes.length > 0 ? <Text dimColor>agents</Text> : null}
      {panes.map((pane) => (
        <Text key={pane.paneId} color={agentColor(pane)}>
          {pane.agent} {pane.paneId} {pane.status} {pane.lastLine}
        </Text>
      ))}
    </Box>
  );
}

function HelpOverlay() {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Help</Text>
      {helpRows.map(([keys, label]) => (
        <Text key={keys}><Text color="cyan">{keys.padEnd(14)}</Text> {label}</Text>
      ))}
    </Box>
  );
}

function PromptView({ prompt }: { prompt: PromptState }) {
  if (prompt.type === "confirm-remove-project") {
    return <Text color="yellow">Press Enter to remove project {prompt.projectRoot}, Esc to cancel.</Text>;
  }
  if (prompt.type === "confirm-remove-orphan") {
    return <Text color="yellow">Press Enter to remove orphan {prompt.context.branch}, Esc to cancel.</Text>;
  }
  const label = prompt.type === "add-project" ? "Project path" : "New branch";
  return <Text color="yellow">{label}: {prompt.value}</Text>;
}

function buildContextRows(project: ProjectContexts | undefined): ContextRow[] {
  if (!project) return [];
  const workspaceRow: ContextRow = project.workspaceSession
    ? {
        type: "workspace",
        label: `workspace session  ${project.workspaceSession.status}`,
        workspace: project.workspaceSession
      }
    : {
        type: "workspace-missing",
        label: "workspace session  missing",
        projectRoot: project.project.root
      };
  return [
    workspaceRow,
    ...project.contexts.map((context) => ({
      type: "context" as const,
      label: `${context.branch}  ${context.status}${context.agentPanes.length > 0 ? `  ${context.agentPanes.length} agent` : ""}`,
      context
    }))
  ];
}

function statusColor(row: ContextRow): "green" | "yellow" | "red" | "white" {
  const status = row.type === "context" ? row.context.status : row.type === "workspace" ? row.workspace.status : "missing_tmux";
  if (status === "ready") return "green";
  if (status === "missing_tmux" || status === "missing_terminal") return "yellow";
  if (status === "orphan_tmux" || status === "error") return "red";
  return "white";
}

function detailTitle(row: ContextRow): string {
  if (row.type === "workspace") return `Workspace: ${row.workspace.name} (${row.workspace.status})`;
  if (row.type === "workspace-missing") return "Workspace session is missing";
  return `${row.context.branch} (${row.context.status})`;
}

function readAgentPanes(row: ContextRow | undefined): AgentPane[] {
  if (!row) return [];
  if (row.type === "workspace") return row.workspace.agentPanes;
  if (row.type === "context") return row.context.agentPanes;
  return [];
}

function agentColor(pane: AgentPane): "green" | "yellow" | "red" | "white" {
  if (pane.status === "running") return "green";
  if (pane.status === "waiting") return "yellow";
  if (pane.status === "error") return "red";
  return "white";
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
