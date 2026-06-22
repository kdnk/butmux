import { describe, expect, it } from "vitest";
import {
  buildContextRows,
  createBranchPrompt,
  selectedBranchAnchor
} from "../src/tui/rows";
import type { ProjectContexts } from "../src/core/model";

const project: ProjectContexts = {
  project: { root: "/repo/a", name: "a", projectKey: "%2Frepo%2Fa", order: 10, enabled: true },
  workspaceSession: undefined,
  contexts: [
    {
      id: "ctx-a",
      type: "managed",
      projectRoot: "/repo/a",
      branch: "feature/base",
      branchKey: "feature%2Fbase",
      branchId: "bu",
      tmuxSession: "bm_a_feature%2Fbase",
      terminalTabTitle: "bm_a_feature%2Fbase",
      agentPanes: [],
      order: 10,
      status: "ready"
    }
  ],
  warnings: []
};

describe("tui rows", () => {
  it("builds workspace and managed context rows", () => {
    const rows = buildContextRows(project);

    expect(rows[0]).toMatchObject({ type: "workspace-missing", label: "workspace session  missing" });
    expect(rows[1]).toMatchObject({ type: "context", label: "feature/base  ready" });
  });

  it("returns dependent branch anchors only for managed context rows", () => {
    const rows = buildContextRows(project);

    expect(selectedBranchAnchor(rows[0])).toBeUndefined();
    expect(selectedBranchAnchor(rows[1])).toEqual({
      anchor: "bu",
      label: "feature/base"
    });
  });

  it("creates independent branch prompts for the selected project", () => {
    const rows = buildContextRows(project);

    expect(createBranchPrompt("b", project, rows[1])).toEqual({
      type: "create-branch",
      value: "",
      projectRoot: "/repo/a",
      mode: "independent"
    });
  });

  it("creates dependent branch prompts only from managed contexts", () => {
    const rows = buildContextRows(project);

    expect(createBranchPrompt("B", project, rows[0])).toBeUndefined();
    expect(createBranchPrompt("B", project, rows[1])).toEqual({
      type: "create-branch",
      value: "",
      projectRoot: "/repo/a",
      mode: "dependent",
      anchor: "bu",
      anchorLabel: "feature/base"
    });
  });
});
