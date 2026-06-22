import { describe, expect, it } from "vitest";
import {
  clampSelection,
  cyclePane,
  moveSelection,
  switchPane,
  toReorderIntent,
  type TuiPane
} from "../src/tui/state";
import { keyHintsForContext } from "../src/tui/keymap";

describe("TUI state helpers", () => {
  it("switches panes left and right", () => {
    expect(switchPane("projects", "right")).toBe("contexts");
    expect(switchPane("contexts", "right")).toBe("detail");
    expect(switchPane("detail", "right")).toBe("detail");
    expect(switchPane("detail", "left")).toBe("contexts");
    expect(switchPane("contexts", "left")).toBe("projects");
    expect(switchPane("projects", "left")).toBe("projects");
  });

  it("moves selection within bounds", () => {
    expect(moveSelection(0, -1, 3)).toBe(0);
    expect(moveSelection(0, 1, 3)).toBe(1);
    expect(moveSelection(2, 1, 3)).toBe(2);
    expect(moveSelection(3, 0, 0)).toBe(0);
  });

  it("clamps selection when list sizes shrink", () => {
    expect(clampSelection(5, 2)).toBe(1);
    expect(clampSelection(1, 2)).toBe(1);
    expect(clampSelection(1, 0)).toBe(0);
  });

  it("creates reorder intents for project and context panes", () => {
    expect(toReorderIntent("projects", 1, -1, 3)).toEqual({ from: 1, to: 0 });
    expect(toReorderIntent("contexts", 1, 1, 3)).toEqual({ from: 1, to: 2 });
    expect(toReorderIntent("detail", 1, 1, 3)).toBeUndefined();
    expect(toReorderIntent("projects" satisfies TuiPane, 0, -1, 3)).toBeUndefined();
    expect(toReorderIntent("contexts", 2, 1, 3)).toBeUndefined();
  });

  it("cycles panes with Tab-style movement", () => {
    expect(cyclePane("projects", 1)).toBe("contexts");
    expect(cyclePane("contexts", 1)).toBe("detail");
    expect(cyclePane("detail", 1)).toBe("projects");
    expect(cyclePane("projects", -1)).toBe("detail");
    expect(cyclePane("detail", -1)).toBe("contexts");
  });

  it("returns context-sensitive key hints", () => {
    expect(keyHintsForContext({
      pane: "projects",
      hasProject: true,
      hasContext: false,
      hasManagedContext: false
    })).toContainEqual(["b", "new branch"]);

    expect(keyHintsForContext({
      pane: "contexts",
      hasProject: true,
      hasContext: true,
      hasManagedContext: true
    })).toEqual(expect.arrayContaining([
      ["b", "new branch"],
      ["B", "branch from selected"],
      ["n", "rename"]
    ]));

    expect(keyHintsForContext({
      pane: "contexts",
      hasProject: true,
      hasContext: true,
      hasManagedContext: false
    })).not.toContainEqual(["B", "branch from selected"]);
  });
});
