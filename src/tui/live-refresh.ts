export type WatchLiveUpdates = (onChange: () => void) => () => void;

export function startDebouncedLiveRefresh(
  watchLiveUpdates: WatchLiveUpdates,
  refresh: () => void,
  delayMs = 120
): () => void {
  let timer: NodeJS.Timeout | undefined;
  const stopWatching = watchLiveUpdates(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      refresh();
    }, delayMs);
  });

  return () => {
    if (timer) clearTimeout(timer);
    stopWatching();
  };
}
