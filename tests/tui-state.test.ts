import { describe, expect, it } from "vitest";
import {
  clampSelection,
  moveSelection
} from "../src/tui/state";
import { helpRows, keyHintsForContext } from "../src/tui/keymap";

describe("TUI state helpers", () => {
  it("keeps single-list selection within bounds", () => {
    expect(moveSelection(0, -1, 3)).toBe(0);
    expect(moveSelection(0, 1, 3)).toBe(1);
    expect(moveSelection(2, 1, 3)).toBe(2);
    expect(moveSelection(3, 0, 0)).toBe(0);
    expect(clampSelection(5, 2)).toBe(1);
    expect(clampSelection(1, 2)).toBe(1);
    expect(clampSelection(1, 0)).toBe(0);
  });

  it("returns row-aware key hints without pane navigation", () => {
    const hints = keyHintsForContext({
      hasRow: true,
      hasWorkspaceRow: false,
      hasManagedContext: true,
      hasRemovableOrphan: false,
      canReorderContext: true
    });

    expect(hints).toEqual(expect.arrayContaining([
      ["enter", "focus"],
      ["s", "sync project"],
      ["b", "branch"],
      ["B", "dependent"],
      ["n", "rename"],
      ["[/]", "move"]
    ]));
    expect(hints).not.toContainEqual(["tab", "pane"]);
  });

  it("limits destructive and context-only hints to matching rows", () => {
    expect(keyHintsForContext({
      hasRow: true,
      hasWorkspaceRow: true,
      hasManagedContext: false,
      hasRemovableOrphan: false,
      canReorderContext: false
    })).toEqual(expect.arrayContaining([
      ["x", "remove project"],
      ["c", "workspace"]
    ]));

    expect(keyHintsForContext({
      hasRow: true,
      hasWorkspaceRow: false,
      hasManagedContext: true,
      hasRemovableOrphan: true,
      canReorderContext: false
    })).toEqual(expect.arrayContaining([
      ["x", "remove orphan"]
    ]));

    expect(keyHintsForContext({
      hasRow: false,
      hasWorkspaceRow: false,
      hasManagedContext: false,
      hasRemovableOrphan: false,
      canReorderContext: false
    })).not.toContainEqual(["enter", "focus"]);
  });

  it("removes pane navigation from help rows", () => {
    expect(helpRows).toContainEqual(["enter", "focus selected workspace, context, or pane"]);
    expect(helpRows).not.toContainEqual(["h/l, arrows", "switch pane"]);
    expect(helpRows).not.toContainEqual(["tab / shift+tab", "cycle panes"]);
  });
});
