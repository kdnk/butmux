import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

describe("plugin setup documentation", () => {
  it("documents Codex and Claude plugin installation as the primary hook setup", () => {
    const readme = readFileSync(`${repoRoot}/README.md`, "utf8");

    expect(readme).toContain("## Agent Integration");
    expect(readme).toContain("## Plugin Hook Setup");
    expect(readme).toContain("codex-butmux");
    expect(readme).toContain("claude-butmux");
    expect(readme).toContain("codex plugin marketplace add .");
    expect(readme).toContain("codex plugin add codex-butmux@butmux");
    expect(readme).toContain("claude plugin marketplace add .");
    expect(readme).toContain("claude plugin install claude-butmux@butmux");
    expect(readme).toContain(".agents/plugins/marketplace.json");
    expect(readme).toContain(".claude-plugin/marketplace.json");
    expect(readme).toContain("BUTMUX_BIN");
    expect(readme).toContain("command -v butmux");
    expect(readme).toContain("/hooks");
    expect(readme).toContain("TMUX_PANE");
  });

  it("keeps manual hook commands as a fallback reference", () => {
    const readme = readFileSync(`${repoRoot}/README.md`, "utf8");

    expect(readme).toContain("## Manual Hook Reference");
    expect(readme).toContain("butmux hook codex session-start");
    expect(readme).toContain("butmux hook claude session-start");
    expect(readme).not.toContain("Enable hooks in `~/.codex/config.toml`");
  });
});
