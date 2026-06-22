import { describe, expect, it } from "vitest";
import {
  clampSelection,
  moveSelection,
  switchPane,
  toReorderIntent,
  type TuiPane
} from "../src/tui/state";

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
});
