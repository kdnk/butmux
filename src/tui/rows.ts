import type { AgentPane, Context, ProjectContexts, WorkspaceSession } from "../core/model";

export type WorkbenchRowStatus = Context["status"] | WorkspaceSession["status"];

type WorkbenchRowBase = {
  project: ProjectContexts;
  projectRoot: string;
  projectName: string;
  name: string;
  status: WorkbenchRowStatus;
  agentPanes: AgentPane[];
};

export type WorkbenchRow =
  | (WorkbenchRowBase & { type: "workspace"; workspace?: WorkspaceSession })
  | (WorkbenchRowBase & { type: "context"; context: Context });

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
    const workspaceRow: WorkbenchRow = workspace
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
      ...project.contexts.map((context): WorkbenchRow => ({
        type: "context",
        project,
        projectRoot: project.project.root,
        projectName: project.project.name,
        name: context.branch,
        status: context.status,
        agentPanes: context.agentPanes,
        context
      }))
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
  if (row.status === "ready") return "green";
  if (row.status === "missing_tmux" || row.status === "missing_terminal") return "yellow";
  if (row.status === "orphan_tmux" || row.status === "error") return "red";
  return "white";
}

export function statusLabel(status: WorkbenchRowStatus): string {
  return status.replaceAll("_", " ");
}

export function detailTitle(row: WorkbenchRow): string {
  if (row.type === "workspace") return `Workspace: ${row.name} (${statusLabel(row.status)})`;
  return `${row.context.branch} (${statusLabel(row.context.status)})`;
}

export function readAgentPanes(row: WorkbenchRow | undefined): AgentPane[] {
  return row?.agentPanes ?? [];
}

export function agentSummary(row: WorkbenchRow): string {
  if (row.agentPanes.length === 0) return "-";
  if (row.agentPanes.length === 1) {
    const pane = row.agentPanes[0]!;
    return `${pane.agent} ${pane.status}`;
  }
  return `${row.agentPanes.length} agents`;
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
