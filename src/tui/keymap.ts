export type KeyHint = readonly [string, string];
export type GitButlerModeIntent = "setup" | "teardown";

export type KeyHintContext = {
  hasRow: boolean;
  hasWorkspaceRow: boolean;
  hasManagedContext: boolean;
  hasRemovableOrphan: boolean;
  canReorderContext: boolean;
  gitButlerModeIntent?: GitButlerModeIntent;
};

export const helpRows = [
  ["j/k, arrows", "move selection"],
  ["enter", "focus selected workspace, branch, or agent"],
  ["r", "refresh"],
  ["s", "sync selected row's project"],
  ["a", "add project path"],
  ["b", "create independent branch in selected row's project"],
  ["B", "create dependent branch from selected branch"],
  ["n", "rename selected managed branch"],
  ["g", "run suggested GitButler setup or teardown"],
  ["x", "remove selected project or orphan branch"],
  ["c", "create selected row's project workspace session"],
  ["[ / ]", "move selected managed branch"],
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

  if (context.gitButlerModeIntent) {
    rowHints.push(["g", context.gitButlerModeIntent]);
  }

  if (context.hasWorkspaceRow) {
    rowHints.push(["x", "remove project"]);
  } else if (context.hasRemovableOrphan) {
    rowHints.push(["x", "remove orphan"]);
  }

  return [...rowHints, ...common];
}

export function gitButlerModeIntentForWarnings(
  warnings: readonly string[]
): GitButlerModeIntent | undefined {
  const text = warnings.join("\n").toLowerCase();
  if (text.includes("gitbutler mode exit required") || text.includes("but teardown")) {
    return "teardown";
  }
  if (text.includes("setup required") || text.includes("but setup")) {
    return "setup";
  }
  return undefined;
}
