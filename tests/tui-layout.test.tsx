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

const longCodexLine =
  "gpt-5.5 xhigh - ~/workspaces/github.com/kdnk/butmux - never - Context 31% left - 5h 100% left - weekly 82% left - ".repeat(3);

const idleCodex: AgentPane = {
  agent: "codex",
  paneId: "%9",
  command: "codex",
  lastLine: longCodexLine,
  status: "idle"
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
      header={headerStatus}
      keyBar={<KeyBar rows={[["enter", "focus"], ["b", "branch"]]} />}
    >
      <WorkbenchTable rows={rows} selectedIndex={4} />
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
    expect(output).toContain("fix/path");
    expect(output).toContain("missing terminal");
    expect(output).not.toContain("claude running");
    expect(output).toContain("pane");
    expect(output).toContain("claude %3");
    expect(output).toContain("working");
    expect(output).not.toContain("tmux:");
    expect(output).not.toContain("terminal:");
    expect(output).not.toContain("bm_fix/path");
    expect(output).not.toContain("[2]-Selected");
    expect(output).not.toContain("Selected");
    expect(output).not.toContain("Projects");
    expect(output).not.toContain("Contexts");
  });

  it("outlines the selected row instead of filling it", () => {
    const output = renderToString(
      <WorkbenchTable rows={buildWorkbenchRows([projectB])} selectedIndex={2} />,
      { columns: 120 }
    );
    const lines = output.split("\n");
    const selectedLine = lines.findIndex((line) => line.includes("claude %3"));

    expect(selectedLine).toBeGreaterThan(0);
    expect(lines[selectedLine - 1]).toContain("╭");
    expect(lines[selectedLine + 1]).toContain("╰");
  });

  it("renders compact round frames with lazygit-style titles", () => {
    const output = renderWorkbenchLayout();

    expect(output).toContain("╭");
    expect(output).toContain("╮");
    expect(output).toContain("╰");
    expect(output).toContain("╯");
    expect(output).toContain("[0]-butmux");
    expect(output).toContain("[1]-Workspaces");
    expect(output).not.toContain("[2]-Keys");
    expect(output).not.toContain("Activity");
    expect(output).not.toMatch(/\n\s*\n/);
  });

  it("keeps rows single-line when pane output is wider than the table", () => {
    const longOutputProject = project({
      root: "/repo/long-output",
      name: "long-output",
      contexts: [
        context({
          projectRoot: "/repo/long-output",
          branch: "long-line",
          agentPanes: [idleCodex]
        }),
        context({
          projectRoot: "/repo/long-output",
          branch: "after-long-line"
        })
      ]
    });

    const output = renderToString(
      <WorkbenchTable rows={buildWorkbenchRows([longOutputProject])} selectedIndex={0} />,
      { columns: 120 }
    );
    const lines = output.split("\n");
    const longPaneLine = lines.findIndex((line) => line.includes("codex %9"));
    const followingContextLine = lines.findIndex((line) => line.includes("after-long-line"));
    const workspaceBottomLine = lines.findIndex((line, index) => index > 0 && line.startsWith("╰"));

    expect(longPaneLine).toBeGreaterThan(-1);
    expect(followingContextLine).toBe(longPaneLine + 1);
    expect(workspaceBottomLine).toBeGreaterThan(followingContextLine);
  });

  it("stretches every frame to the render width", () => {
    const output = renderWorkbenchLayout();

    const frameTopLines = output
      .split("\n")
      .filter((line) => line.startsWith("╭["));

    expect(frameTopLines).toHaveLength(2);
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
    expect(output).not.toContain("[2]-Keys");
  });

  it("renders key hints as an unframed wrapping footer", () => {
    const output = renderToString(
      <KeyBar rows={[
        ["enter", "focus"],
        ["s", "sync"],
        ["b", "branch"],
        ["B", "dependent"],
        ["n", "rename"],
        ["?", "help"],
        ["q", "quit"]
      ]} />,
      { columns: 28 }
    );

    expect(output).toContain("enter focus");
    expect(output).toContain("q quit");
    expect(output).not.toContain("╭");
    expect(output).not.toContain("[2]-Keys");
    expect(output.split("\n").length).toBeGreaterThan(1);
  });
});
