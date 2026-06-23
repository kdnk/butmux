import { useEffect, useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import type { AppService, AppState } from "../core/app-service";
import { watchLiveUpdates } from "../core/live-updates";
import type { Context } from "../core/model";
import { helpRows, keyHintsForContext } from "./keymap";
import { ActivityStrip, KeyBar, Shell, WorkbenchTable } from "./layout";
import { startDebouncedLiveRefresh } from "./live-refresh";
import {
  buildWorkbenchRows,
  createBranchPrompt,
  toContextReorderIntent,
  type BranchPromptState
} from "./rows";
import { clampSelection, moveSelection } from "./state";

type PromptState =
  | { type: "add-project"; value: string }
  | BranchPromptState
  | { type: "rename-context"; value: string; context: Context }
  | { type: "confirm-remove-project"; projectRoot: string }
  | { type: "confirm-remove-orphan"; context: Context };

const emptyState: AppState = {
  projectsWithContexts: [],
  warnings: []
};

export function TuiApp({ service }: { service: AppService }) {
  const { exit } = useApp();
  const [state, setState] = useState<AppState>(emptyState);
  const [rowIndex, setRowIndex] = useState(0);
  const [busy, setBusy] = useState<string | undefined>("loading");
  const [error, setError] = useState<string | undefined>();
  const [lastSync, setLastSync] = useState<string | undefined>();
  const [helpOpen, setHelpOpen] = useState(false);
  const [prompt, setPrompt] = useState<PromptState | undefined>();

  const rows = useMemo(() => buildWorkbenchRows(state.projectsWithContexts), [state.projectsWithContexts]);
  const selectedRow = rows[rowIndex];
  const keyHints = keyHintsForContext({
    hasRow: Boolean(selectedRow),
    hasWorkspaceRow: selectedRow?.type === "workspace",
    hasManagedContext: selectedRow?.type === "context",
    hasRemovableOrphan: selectedRow?.type === "context" && selectedRow.context.status === "orphan_tmux",
    canReorderContext: selectedRow?.type === "context" && selectedRow.project.contexts.length > 1
  });

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
    setRowIndex((current) => clampSelection(current, rows.length));
  }, [rows.length]);

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
    if (input === "b" || input === "B") {
      const branchPrompt = createBranchPrompt(input, selectedRow);
      if (branchPrompt) setPrompt(branchPrompt);
      return;
    }
    if (input === "n") {
      if (selectedRow?.type === "context") {
        setPrompt({
          type: "rename-context",
          value: selectedRow.context.branch,
          context: selectedRow.context
        });
      }
      return;
    }
    if (input === "x") {
      if (selectedRow?.type === "workspace") {
        setPrompt({ type: "confirm-remove-project", projectRoot: selectedRow.projectRoot });
      } else if (selectedRow?.type === "context" && selectedRow.context.status === "orphan_tmux") {
        setPrompt({ type: "confirm-remove-orphan", context: selectedRow.context });
      }
      return;
    }
    if (input === "c") {
      if (selectedRow) {
        void runAction("creating workspace session", async () =>
          await service.createWorkspaceSession(selectedRow.projectRoot)
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
    if (current.type === "create-branch") {
      await runAction("creating branch", async () => {
        const next = await service.createBranch({
          projectRoot: current.projectRoot,
          name: current.value,
          ...(current.mode === "dependent" ? { anchor: current.anchor } : {})
        });
        setLastSync(`created ${next.branchName}; synced ${next.commands.length} commands`);
        return next;
      });
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
    setRowIndex((current) => moveSelection(current, delta, rows.length));
  }

  async function syncSelectedProject() {
    if (!selectedRow) return;
    await runAction("syncing", async () => {
      const next = await service.syncProject(selectedRow.projectRoot);
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
    const intent = toContextReorderIntent(rows, rowIndex, delta);
    if (!intent) return;
    setRowIndex(intent.nextRowIndex);
    await runAction("reordering contexts", async () =>
      await service.reorderContexts(intent.projectRoot, intent.from, intent.to)
    );
  }

  async function focusSelected() {
    if (selectedRow?.type === "workspace") {
      const workspace = selectedRow.workspace;
      if (!workspace) {
        await runAction("creating workspace session", async () =>
          await service.createWorkspaceSession(selectedRow.projectRoot)
        );
        return;
      }
      await runAction("focusing workspace", async () => {
        await service.focusWorkspaceSession({
          projectRoot: workspace.projectRoot,
          ...(workspace.primaryPaneId ? { paneId: workspace.primaryPaneId } : {})
        });
      });
      return;
    }
    if (selectedRow?.type === "context") {
      await runAction("focusing context", async () => {
        await service.focusContext({
          projectRoot: selectedRow.context.projectRoot,
          branchKey: selectedRow.context.branchKey,
          ...(selectedRow.context.primaryPaneId ? { paneId: selectedRow.context.primaryPaneId } : {})
        });
      });
    }
  }

  return (
    <Shell
      header={<Header busy={busy} lastSync={lastSync} />}
      activity={<ActivityStrip error={error} busy={busy} lastSync={lastSync} warnings={state.warnings} />}
      keyBar={<KeyBar rows={keyHints} />}
    >
      <WorkbenchTable rows={rows} selectedIndex={rowIndex} />
      {helpOpen ? <HelpOverlay /> : null}
      {prompt ? <PromptView prompt={prompt} /> : null}
    </Shell>
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
  if (prompt.type === "create-branch") {
    return (
      <Box flexDirection="column">
        <Text color="yellow">{prompt.mode === "dependent" ? "New dependent GitButler branch" : "New GitButler branch"}</Text>
        {prompt.mode === "dependent" ? <Text>Anchor: {prompt.anchorLabel}</Text> : <Text>Type: independent</Text>}
        <Text>Name: {prompt.value}</Text>
      </Box>
    );
  }
  const label = prompt.type === "add-project" ? "Project path" : "New branch";
  return <Text color="yellow">{label}: {prompt.value}</Text>;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
