import type { AgentPane, Context, ProjectContexts, WorkspaceSession } from "../core/model";

export type WorkbenchRowStatus = Context["status"] | WorkspaceSession["status"] | AgentPane["status"];

type WorkbenchRowBase = {
  project: ProjectContexts;
  projectRoot: string;
  projectName: string;
  name: string;
  status: WorkbenchRowStatus;
  agentPanes: AgentPane[];
};

export type WorkbenchSessionRow =
  | (WorkbenchRowBase & { type: "workspace"; workspace?: WorkspaceSession })
  | (WorkbenchRowBase & { type: "context"; context: Context });

export type WorkbenchPaneRow = WorkbenchRowBase & {
  type: "pane";
  pane: AgentPane;
  parent: WorkbenchSessionRow;
};

export type WorkbenchRow = WorkbenchSessionRow | WorkbenchPaneRow;

export type WorkbenchFocusTarget =
  | { type: "workspace"; projectRoot: string; paneId?: string }
  | { type: "context"; projectRoot: string; branchKey: string; paneId?: string };

export type BranchPromptState =
  | { type: "create-branch"; value: string; projectRoot: string; mode: "independent" }
  | {
      type: "create-branch";
      value: string;
      projectRoot: string;
      mode: "dependent";
      anchor: string;
      anchorLabel: string;
    };

export function buildWorkbenchRows(projects: ProjectContexts[]): WorkbenchRow[] {
  return projects.flatMap((project) => {
    const workspace = project.workspaceSession;
    const workspaceRow: WorkbenchSessionRow = workspace
      ? {
          type: "workspace",
          project,
          projectRoot: project.project.root,
          projectName: project.project.name,
          name: workspace.name,
          status: workspace.status,
          agentPanes: workspace.agentPanes,
          workspace
        }
      : {
          type: "workspace",
          project,
          projectRoot: project.project.root,
          projectName: project.project.name,
          name: project.project.name,
          status: "missing_tmux",
          agentPanes: []
        };

    return [
      workspaceRow,
      ...paneRowsFor(workspaceRow),
      ...project.contexts.flatMap((context): WorkbenchRow[] => {
        const contextRow: WorkbenchSessionRow = {
          type: "context",
          project,
          projectRoot: project.project.root,
          projectName: project.project.name,
          name: context.branch,
          status: context.status,
          agentPanes: context.agentPanes,
          context
        };
        return [contextRow, ...paneRowsFor(contextRow)];
      })
    ];
  });
}

export function selectedBranchAnchor(row: WorkbenchRow | undefined): { anchor: string; label: string } | undefined {
  if (row?.type !== "context") return undefined;
  return {
    anchor: row.context.branchId ?? row.context.branch,
    label: row.context.branch
  };
}

export function createBranchPrompt(input: "b" | "B", row: WorkbenchRow | undefined): BranchPromptState | undefined {
  if (!row) return undefined;
  if (input === "b") {
    return {
      type: "create-branch",
      value: "",
      projectRoot: row.projectRoot,
      mode: "independent"
    };
  }

  const branchAnchor = selectedBranchAnchor(row);
  if (!branchAnchor) return undefined;
  return {
    type: "create-branch",
    value: "",
    projectRoot: row.projectRoot,
    mode: "dependent",
    anchor: branchAnchor.anchor,
    anchorLabel: branchAnchor.label
  };
}

export function statusColor(row: WorkbenchRow): "green" | "yellow" | "red" | "white" {
  if (row.type === "pane") {
    if (row.status === "error") return "red";
    if (row.status === "waiting") return "yellow";
    if (row.status === "running") return "green";
    return "white";
  }
  if (row.status === "ready") return "green";
  if (row.status === "missing_tmux" || row.status === "missing_terminal") return "yellow";
  if (row.status === "orphan_tmux" || row.status === "error") return "red";
  return "white";
}

export function statusLabel(status: WorkbenchRowStatus): string {
  return status.replaceAll("_", " ");
}

export function detailTitle(row: WorkbenchRow): string {
  if (row.type === "pane") return `${row.pane.agent} ${row.pane.paneId} (${statusLabel(row.pane.status)})`;
  if (row.type === "workspace") return `Workspace: ${row.name} (${statusLabel(row.status)})`;
  return `${row.context.branch} (${statusLabel(row.context.status)})`;
}

export function readAgentPanes(row: WorkbenchRow | undefined): AgentPane[] {
  if (row?.type === "pane") return [row.pane];
  return row?.agentPanes ?? [];
}

export function agentSummary(row: WorkbenchRow): string {
  if (row.type === "pane") return row.pane.lastLine || "-";
  if (row.agentPanes.length > 0) return "";
  return "-";
}

export function focusTargetForRow(row: WorkbenchRow | undefined): WorkbenchFocusTarget | undefined {
  if (!row) return undefined;
  if (row.type === "pane") {
    return focusTargetForSessionRow(row.parent, row.pane.paneId);
  }
  return focusTargetForSessionRow(row);
}

export function toContextReorderIntent(
  rows: WorkbenchRow[],
  selectedIndex: number,
  delta: -1 | 1
): { projectRoot: string; from: number; to: number; nextRowIndex: number } | undefined {
  const row = rows[selectedIndex];
  if (row?.type !== "context") return undefined;

  const contexts = row.project.contexts;
  const from = contexts.findIndex((context) => context.id === row.context.id);
  if (from === -1) return undefined;

  const to = from + delta;
  if (to < 0 || to >= contexts.length) return undefined;

  const target = contexts[to];
  const nextRowIndex = rows.findIndex(
    (candidate) => candidate.type === "context" && candidate.context.id === target?.id
  );
  if (nextRowIndex === -1) return undefined;

  return {
    projectRoot: row.projectRoot,
    from,
    to,
    nextRowIndex
  };
}

function paneRowsFor(parent: WorkbenchSessionRow): WorkbenchPaneRow[] {
  return parent.agentPanes.map((pane): WorkbenchPaneRow => ({
    type: "pane",
    project: parent.project,
    projectRoot: parent.projectRoot,
    projectName: parent.projectName,
    name: `${pane.agent} ${pane.paneId}`,
    status: pane.status,
    agentPanes: [],
    pane,
    parent
  }));
}

function focusTargetForSessionRow(
  row: WorkbenchSessionRow,
  paneId?: string
): WorkbenchFocusTarget {
  if (row.type === "workspace") {
    const targetPaneId = paneId ?? row.workspace?.primaryPaneId;
    return {
      type: "workspace",
      projectRoot: row.projectRoot,
      ...(targetPaneId ? { paneId: targetPaneId } : {})
    };
  }
  const targetPaneId = paneId ?? row.context.primaryPaneId;
  return {
    type: "context",
    projectRoot: row.context.projectRoot,
    branchKey: row.context.branchKey,
    ...(targetPaneId ? { paneId: targetPaneId } : {})
  };
}
