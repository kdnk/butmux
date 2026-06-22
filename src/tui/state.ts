export type TuiPane = "projects" | "contexts" | "detail";

export type Direction = "left" | "right";

const panes: TuiPane[] = ["projects", "contexts", "detail"];

export function switchPane(current: TuiPane, direction: Direction): TuiPane {
  const index = panes.indexOf(current);
  const nextIndex = direction === "right" ? index + 1 : index - 1;
  return panes[Math.max(0, Math.min(panes.length - 1, nextIndex))] ?? current;
}

export function cyclePane(current: TuiPane, direction: -1 | 1): TuiPane {
  const index = panes.indexOf(current);
  const nextIndex = (index + direction + panes.length) % panes.length;
  return panes[nextIndex] ?? current;
}

export function moveSelection(current: number, delta: number, itemCount: number): number {
  if (itemCount <= 0) return 0;
  return Math.max(0, Math.min(itemCount - 1, current + delta));
}

export function clampSelection(current: number, itemCount: number): number {
  return moveSelection(current, 0, itemCount);
}

export function toReorderIntent(
  pane: TuiPane,
  index: number,
  delta: -1 | 1,
  itemCount: number
): { from: number; to: number } | undefined {
  if (pane !== "projects" && pane !== "contexts") return undefined;
  const to = index + delta;
  if (to < 0 || to >= itemCount) return undefined;
  return { from: index, to };
}
