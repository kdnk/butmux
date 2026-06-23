import { describe, expect, it } from "vitest";
import {
  agentSummary,
  buildWorkbenchRows,
  createBranchPrompt,
  selectedBranchAnchor,
  toContextReorderIntent
} from "../src/tui/rows";
import type { AgentPane, Context, ProjectContexts, WorkspaceSession } from "../src/core/model";

const runningClaude: AgentPane = {
  agent: "claude",
  paneId: "%3",
  command: "claude",
  lastLine: "working",
  status: "running"
};

function context(input: Partial<Context> & { branch: string; projectRoot: string }): Context {
  return {
    id: `ctx-${input.branch}`,
    type: "managed",
    branchKey: encodeURIComponent(input.branch),
    branchId: `${input.branch}-id`,
    tmuxSession: `bm_${input.branch}`,
    terminalTabTitle: `bm_${input.branch}`,
    agentPanes: [],
    order: 10,
    status: "ready",
    ...input
  };
}

function workspace(input: Partial<WorkspaceSession> & { projectRoot: string; name: string }): WorkspaceSession {
  return {
    type: "workspace",
    terminalTabTitle: input.name,
    agentPanes: [],
    status: "ready",
    ...input
  };
}

function project(input: {
  root: string;
  name: string;
  workspaceSession?: WorkspaceSession;
  contexts: Context[];
  warnings?: string[];
}): ProjectContexts {
  return {
    project: {
      root: input.root,
      name: input.name,
      projectKey: encodeURIComponent(input.root),
      order: 10,
      enabled: true
    },
    workspaceSession: input.workspaceSession,
    contexts: input.contexts,
    warnings: input.warnings ?? []
  };
}

const projectA = project({
  root: "/repo/a",
  name: "a",
  contexts: [
    context({
      projectRoot: "/repo/a",
      branch: "feature/base"
    })
  ]
});

const projectB = project({
  root: "/repo/b",
  name: "b",
  workspaceSession: workspace({
    projectRoot: "/repo/b",
    name: "b-workspace"
  }),
  contexts: [
    context({
      projectRoot: "/repo/b",
      branch: "fix/path",
      agentPanes: [runningClaude],
      status: "missing_terminal"
    })
  ]
});

const projectAWithTwoContexts = project({
  root: "/repo/a",
  name: "a",
  contexts: [
    context({
      projectRoot: "/repo/a",
      branch: "feature/one",
      order: 10
    }),
    context({
      projectRoot: "/repo/a",
      branch: "feature/two",
      order: 20
    })
  ]
});

describe("tui rows", () => {
  it("builds a flat workbench row list across projects", () => {
    const rows = buildWorkbenchRows([projectA, projectB]);

    expect(rows.map((row) => [row.projectName, row.type, row.name, row.status])).toEqual([
      ["a", "workspace", "a", "missing_tmux"],
      ["a", "context", "feature/base", "ready"],
      ["b", "workspace", "b-workspace", "ready"],
      ["b", "context", "fix/path", "missing_terminal"]
    ]);
  });

  it("summarizes agent activity for rows", () => {
    const rows = buildWorkbenchRows([projectA, projectB]);

    expect(agentSummary(rows[0]!)).toBe("-");
    expect(agentSummary(rows[3]!)).toBe("claude running");
  });

  it("returns dependent branch anchors only for managed context rows", () => {
    const rows = buildWorkbenchRows([projectA, projectB]);

    expect(selectedBranchAnchor(rows[0])).toBeUndefined();
    expect(selectedBranchAnchor(rows[1])).toEqual({
      anchor: "feature/base-id",
      label: "feature/base"
    });
  });

  it("creates branch prompts from the selected row project", () => {
    const rows = buildWorkbenchRows([projectA, projectB]);

    expect(createBranchPrompt("b", rows[3])).toEqual({
      type: "create-branch",
      value: "",
      projectRoot: "/repo/b",
      mode: "independent"
    });
    expect(createBranchPrompt("B", rows[3])).toEqual({
      type: "create-branch",
      value: "",
      projectRoot: "/repo/b",
      mode: "dependent",
      anchor: "fix/path-id",
      anchorLabel: "fix/path"
    });
    expect(createBranchPrompt("B", rows[2])).toBeUndefined();
  });

  it("computes context reorder intent within the selected row project", () => {
    const rows = buildWorkbenchRows([projectAWithTwoContexts]);

    expect(toContextReorderIntent(rows, 2, -1)).toEqual({
      projectRoot: "/repo/a",
      from: 1,
      to: 0,
      nextRowIndex: 1
    });
    expect(toContextReorderIntent(rows, 1, -1)).toBeUndefined();
    expect(toContextReorderIntent(rows, 0, 1)).toBeUndefined();
  });
});
