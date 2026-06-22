import { homedir } from "node:os";
import { join } from "node:path";

export type ButmuxPaths = {
  configDir: string;
  stateDir: string;
};

export function resolveButmuxPaths(
  env: NodeJS.ProcessEnv = process.env,
  _platform: NodeJS.Platform = process.platform,
  home = homedir()
): ButmuxPaths {
  const configHome = readNonEmpty(env.XDG_CONFIG_HOME) ?? join(home, ".config");
  const stateHome = readNonEmpty(env.XDG_STATE_HOME) ?? join(home, ".local", "state");
  return {
    configDir: join(configHome, "butmux"),
    stateDir: join(stateHome, "butmux")
  };
}

function readNonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
