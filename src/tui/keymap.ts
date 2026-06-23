import type { TuiPane } from "./state";

export type KeyHint = readonly [string, string];

export type KeyHintContext = {
  pane: TuiPane;
  hasProject: boolean;
  hasContext: boolean;
  hasManagedContext: boolean;
};

export const helpRows = [
  ["j/k, arrows", "move selection"],
  ["h/l, arrows", "switch pane"],
  ["tab / shift+tab", "cycle panes"],
  ["enter", "focus selected item"],
  ["r", "refresh"],
  ["s", "sync selected project"],
  ["a", "add project path"],
  ["b", "create independent branch"],
  ["B", "create dependent branch from selected context"],
  ["n", "rename context"],
  ["x", "remove project or orphan"],
  ["c", "create workspace session"],
  ["[ / ]", "move project/context"],
  [",", "cycle terminal backend"],
  ["?", "toggle help"],
  ["q", "quit"]
] as const;

export function keyHintsForContext(context: KeyHintContext): readonly KeyHint[] {
  const common: readonly KeyHint[] = [
    ["tab", "pane"],
    ["j/k", "move"],
    ["r", "refresh"],
    ["?", "help"],
    ["q", "quit"]
  ];
  const branchHints: readonly KeyHint[] = context.hasProject ? [["b", "new branch"]] : [];

  if (context.pane === "projects") {
    return [
      ...branchHints,
      ...(context.hasProject ? ([["s", "sync"], ["c", "workspace"], ["x", "remove"]] as const) : []),
      ["a", "add project"],
      ...common
    ];
  }

  if (context.pane === "contexts") {
    return [
      ...(context.hasContext ? ([["enter", "focus"]] as const) : []),
      ...branchHints,
      ...(context.hasManagedContext ? ([["B", "branch from selected"], ["n", "rename"], ["[/]", "move"]] as const) : []),
      ...common
    ];
  }

  return [
    ...(context.hasContext ? ([["enter", "focus pane"]] as const) : []),
    ...branchHints,
    ...common
  ];
}
