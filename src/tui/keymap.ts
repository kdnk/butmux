export type KeyHint = readonly [string, string];

export type KeyHintContext = {
  hasRow: boolean;
  hasWorkspaceRow: boolean;
  hasManagedContext: boolean;
  hasRemovableOrphan: boolean;
  canReorderContext: boolean;
};

export const helpRows = [
  ["j/k, arrows", "move selection"],
  ["enter", "focus selected workspace or context"],
  ["r", "refresh"],
  ["s", "sync selected row's project"],
  ["a", "add project path"],
  ["b", "create independent branch in selected row's project"],
  ["B", "create dependent branch from selected context"],
  ["n", "rename selected managed context"],
  ["x", "remove selected project or orphan"],
  ["c", "create selected row's project workspace session"],
  ["[ / ]", "move selected managed context"],
  [",", "cycle terminal backend"],
  ["?", "toggle help"],
  ["q", "quit"]
] as const;

export function keyHintsForContext(context: KeyHintContext): readonly KeyHint[] {
  const common: KeyHint[] = [
    ["j/k", "move"],
    ["r", "refresh"],
    ["a", "add"],
    [",", "backend"],
    ["?", "help"],
    ["q", "quit"]
  ];

  if (!context.hasRow) return common;

  const rowHints: KeyHint[] = [
    ["enter", "focus"],
    ["s", "sync project"],
    ["b", "branch"],
    ["c", "workspace"]
  ];

  if (context.hasManagedContext) {
    rowHints.push(["B", "dependent"], ["n", "rename"]);
  }

  if (context.canReorderContext) {
    rowHints.push(["[/]", "move"]);
  }

  if (context.hasWorkspaceRow) {
    rowHints.push(["x", "remove project"]);
  } else if (context.hasRemovableOrphan) {
    rowHints.push(["x", "remove orphan"]);
  }

  return [...rowHints, ...common];
}
