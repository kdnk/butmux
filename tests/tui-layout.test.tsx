import { describe, expect, it } from "vitest";
import { Text, renderToString } from "ink";
import type { ReactNode } from "react";
import {
  HeaderStatus,
  KeyBar,
  Shell,
  WorkbenchTable
} from "../src/tui/layout";
import { buildWorkbenchRows } from "../src/tui/rows";
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
  ],
  warnings: ["a warning"]
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

function renderWorkbenchLayout({
  headerStatus = <HeaderStatus error={undefined} busy={undefined} lastSync="ready" warnings={[]} />
}: {
  headerStatus?: ReactNode;
} = {}) {
  const rows = buildWorkbenchRows([projectA, projectB]);
  return renderToString(
    <Shell
      header={<><Text>butmux</Text>{headerStatus}</>}
      keyBar={<KeyBar rows={[["enter", "focus"], ["b", "branch"]]} />}
    >
      <WorkbenchTable rows={rows} selectedIndex={3} />
    </Shell>,
    { columns: 120 }
  );
}

describe("TUI layout", () => {
  it("renders all project rows and details in the workspaces view", () => {
    const output = renderWorkbenchLayout();

    expect(output).toContain("butmux");
    expect(output).toContain("Project");
    expect(output).toContain("Type");
    expect(output).toContain("Name");
    expect(output).toContain("Agents");
    expect(output).toContain("a");
    expect(output).toContain("b");
    expect(output).toContain("/repo/a");
    expect(output).toContain("/repo/b");
    expect(output).toContain("a warning");
    expect(output).toContain("tmux: missing tmux");
    expect(output).toContain("terminal: missing terminal");
    expect(output).toContain("tmux: bm_feature/base");
    expect(output).toContain("terminal: bm_feature/base");
    expect(output).toContain("tmux: b-workspace");
    expect(output).toContain("terminal: b-workspace");
    expect(output).toContain("fix/path");
    expect(output).toContain("missing terminal");
    expect(output).toContain("claude running");
    expect(output).toContain("bm_fix/path");
    expect(output).not.toContain("[2]-Selected");
    expect(output).not.toContain("Selected");
    expect(output).not.toContain("Projects");
    expect(output).not.toContain("Contexts");
  });

  it("renders compact round frames with lazygit-style titles", () => {
    const output = renderWorkbenchLayout();

    expect(output).toContain("╭");
    expect(output).toContain("╮");
    expect(output).toContain("╰");
    expect(output).toContain("╯");
    expect(output).toContain("[0]-butmux");
    expect(output).toContain("[1]-Workspaces");
    expect(output).toContain("[2]-Keys");
    expect(output).not.toContain("Activity");
    expect(output).not.toMatch(/\n\s*\n/);
  });

  it("stretches every frame to the render width", () => {
    const output = renderWorkbenchLayout();

    const frameTopLines = output
      .split("\n")
      .filter((line) => line.startsWith("╭["));

    expect(frameTopLines).toHaveLength(3);
    for (const line of frameTopLines) {
      expect(line.length).toBeGreaterThanOrEqual(100);
    }
  });

  it("renders status in the header instead of a separate activity frame", () => {
    const output = renderWorkbenchLayout({
      headerStatus: <HeaderStatus error="failed" busy={undefined} lastSync="ready" warnings={[]} />
    });

    expect(output).toContain("error: failed");
    expect(output).toContain("[0]-butmux");
    expect(output).not.toContain("[2]-Activity");
    expect(output).toContain("[2]-Keys");
  });
});
