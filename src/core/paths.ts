import { homedir } from "node:os";
import { join } from "node:path";

export type SeitonPaths = {
  configDir: string;
  stateDir: string;
};

export function resolveSeitonPaths(
  env: NodeJS.ProcessEnv = process.env,
  _platform: NodeJS.Platform = process.platform,
  home = homedir()
): SeitonPaths {
  const configHome = readNonEmpty(env.XDG_CONFIG_HOME) ?? join(home, ".config");
  const stateHome = readNonEmpty(env.XDG_STATE_HOME) ?? join(home, ".local", "state");
  return {
    configDir: join(configHome, "seiton"),
    stateDir: join(stateHome, "seiton")
  };
}

function readNonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
