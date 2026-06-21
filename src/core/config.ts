import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TerminalBackendName } from "./model";

export type SeitonConfig = {
  terminalBackend: TerminalBackendName;
};

export function configPath(configDir: string): string {
  return join(configDir, "config.json");
}

export async function loadConfig(configDir: string): Promise<SeitonConfig> {
  try {
    const raw = await readFile(configPath(configDir), "utf8");
    const parsed = JSON.parse(raw) as Partial<SeitonConfig>;
    return normalizeConfig(parsed);
  } catch (error) {
    if (isMissingFile(error)) {
      return defaultConfig();
    }
    throw error;
  }
}

export async function saveConfig(configDir: string, config: SeitonConfig): Promise<void> {
  await mkdir(configDir, { recursive: true });
  await writeFile(configPath(configDir), `${JSON.stringify(normalizeConfig(config), null, 2)}\n`);
}

export function defaultConfig(): SeitonConfig {
  return { terminalBackend: "kitty" };
}

export function normalizeConfig(input: Partial<SeitonConfig>): SeitonConfig {
  return {
    terminalBackend: input.terminalBackend === "wezterm" ? "wezterm" : "kitty"
  };
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
