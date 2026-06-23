export function moveSelection(current: number, delta: number, itemCount: number): number {
  if (itemCount <= 0) return 0;
  return Math.max(0, Math.min(itemCount - 1, current + delta));
}

export function clampSelection(current: number, itemCount: number): number {
  return moveSelection(current, 0, itemCount);
}
