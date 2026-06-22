import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(`${repoRoot}/${relativePath}`, "utf8")) as T;
}

type HookGroup = {
  matcher?: string;
  hooks: Array<{
    type: string;
    command: string;
    timeout?: number;
    statusMessage?: string;
  }>;
};

type HooksFile = {
  hooks: Record<string, HookGroup[]>;
};

function collectCommands(hooksFile: HooksFile): string[] {
  return Object.values(hooksFile.hooks).flatMap((groups) =>
    groups.flatMap((group) => group.hooks.map((hook) => hook.command))
  );
}

function expectBestEffortHookCommand(command: string, agent: string, event: string): void {
  expect(command).toContain("TMUX_PANE");
  expect(command).toContain("exit 0");
  expect(command).toContain("BUTMUX_BIN");
  expect(command).toContain("butmux");
  expect(command).toContain(`hook ${agent} ${event}`);
  expect(command).not.toContain("../");
  expect(command).not.toContain("dist/cli.js");
}

describe("plugin distribution artifacts", () => {
  it("exposes the Codex butmux plugin through the repo marketplace", () => {
    const marketplace = readJson<{
      name: string;
      interface?: { displayName?: string };
      plugins: Array<{
        name: string;
        source: { source: string; path: string };
        policy: { installation: string; authentication: string };
        category: string;
      }>;
    }>(".agents/plugins/marketplace.json");

    expect(marketplace.name).toBe("butmux");
    expect(marketplace.interface?.displayName).toBe("butmux");
    expect(marketplace.plugins).toEqual([
      {
        name: "codex-butmux",
        source: {
          source: "local",
          path: "./plugins/codex-butmux"
        },
        policy: {
          installation: "AVAILABLE",
          authentication: "ON_INSTALL"
        },
        category: "Productivity"
      }
    ]);
  });

  it("defines a valid Codex plugin manifest", () => {
    const manifest = readJson<{
      name: string;
      version: string;
      description: string;
      author: { name: string };
      interface: {
        displayName: string;
        shortDescription: string;
        longDescription: string;
        developerName: string;
        category: string;
      };
      hooks?: unknown;
    }>("plugins/codex-butmux/.codex-plugin/plugin.json");

    expect(manifest.name).toBe("codex-butmux");
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.description).toContain("butmux");
    expect(manifest.author.name).toBe("Kodai Nakamura");
    expect(manifest.interface).toMatchObject({
      displayName: "butmux for Codex",
      developerName: "Kodai Nakamura",
      category: "Productivity"
    });
    expect(manifest.interface.shortDescription).toContain("Codex");
    expect(manifest.interface.longDescription).toContain("butmux");
    expect(manifest).not.toHaveProperty("hooks");
  });

  it("provides best-effort Codex lifecycle hooks", () => {
    const hooksFile = readJson<HooksFile>("plugins/codex-butmux/hooks/hooks.json");

    expect(Object.keys(hooksFile.hooks).sort()).toEqual([
      "SessionStart",
      "Stop",
      "UserPromptSubmit"
    ]);

    const expectedEvents: Record<string, string> = {
      SessionStart: "session-start",
      UserPromptSubmit: "user-prompt-submit",
      Stop: "stop"
    };

    for (const [codexEvent, butmuxEvent] of Object.entries(expectedEvents)) {
      const groups = hooksFile.hooks[codexEvent];
      expect(groups).toHaveLength(1);
      expect(groups?.[0]?.hooks).toHaveLength(1);
      const hook = groups?.[0]?.hooks[0];
      expect(hook?.type).toBe("command");
      expectBestEffortHookCommand(hook?.command ?? "", "codex", butmuxEvent);
    }

    expect(collectCommands(hooksFile)).toHaveLength(3);
  });
});
