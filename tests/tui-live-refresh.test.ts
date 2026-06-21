import { afterEach, describe, expect, it, vi } from "vitest";
import { startDebouncedLiveRefresh } from "../src/tui/live-refresh";

afterEach(() => {
  vi.useRealTimers();
});

describe("startDebouncedLiveRefresh", () => {
  it("debounces live update callbacks and disposes the watcher", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    let listener: (() => void) | undefined;
    const stopWatching = vi.fn();
    const watch = vi.fn((onChange: () => void) => {
      listener = onChange;
      return stopWatching;
    });

    const stop = startDebouncedLiveRefresh(watch, refresh, 120);
    listener?.();
    listener?.();

    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(119);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);

    stop();
    expect(stopWatching).toHaveBeenCalledTimes(1);
  });
});
