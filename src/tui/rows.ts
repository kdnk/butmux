import type { AgentPane, Context, ProjectContexts, WorkspaceSession } from "../core/model";

export type ContextRow =
  | { type: "workspace"; label: string; workspace: WorkspaceSession }
  | { type: "workspace-missing"; label: string; projectRoot: string }
  | { type: "context"; label: string; context: Context };

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

export function buildContextRows(project: ProjectContexts | undefined): ContextRow[] {
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

export function selectedBranchAnchor(row: ContextRow | undefined): { anchor: string; label: string } | undefined {
  if (row?.type !== "context") return undefined;
  return {
    anchor: row.context.branchId ?? row.context.branch,
    label: row.context.branch
  };
}

export function createBranchPrompt(
  input: "b" | "B",
  project: ProjectContexts | undefined,
  row: ContextRow | undefined
): BranchPromptState | undefined {
  if (!project) return undefined;
  if (input === "b") {
    return {
      type: "create-branch",
      value: "",
      projectRoot: project.project.root,
      mode: "independent"
    };
  }

  const branchAnchor = selectedBranchAnchor(row);
  if (!branchAnchor) return undefined;
  return {
    type: "create-branch",
    value: "",
    projectRoot: project.project.root,
    mode: "dependent",
    anchor: branchAnchor.anchor,
    anchorLabel: branchAnchor.label
  };
}

export function statusColor(row: ContextRow): "green" | "yellow" | "red" | "white" {
  const status = row.type === "context" ? row.context.status : row.type === "workspace" ? row.workspace.status : "missing_tmux";
  if (status === "ready") return "green";
  if (status === "missing_tmux" || status === "missing_terminal") return "yellow";
  if (status === "orphan_tmux" || status === "error") return "red";
  return "white";
}

export function detailTitle(row: ContextRow): string {
  if (row.type === "workspace") return `Workspace: ${row.workspace.name} (${row.workspace.status})`;
  if (row.type === "workspace-missing") return "Workspace session is missing";
  return `${row.context.branch} (${row.context.status})`;
}

export function readAgentPanes(row: ContextRow | undefined): AgentPane[] {
  if (!row) return [];
  if (row.type === "workspace") return row.workspace.agentPanes;
  if (row.type === "context") return row.context.agentPanes;
  return [];
}
