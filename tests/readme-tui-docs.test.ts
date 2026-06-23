import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("README TUI docs", () => {
  it("documents single-list navigation and branch creation shortcuts", async () => {
    const readme = await readFile("README.md", "utf8");

    expect(readme).toContain("j/k or Up/Down     move selection");
    expect(readme).toContain("Enter              focus selected workspace, branch, or agent");
    expect(readme).toContain("s                  sync selected row's project");
    expect(readme).toContain("b                  create independent branch in selected row's project");
    expect(readme).toContain("B                   create dependent branch from selected branch");
    expect(readme).toContain("g                  run suggested GitButler setup or teardown");
    expect(readme).not.toContain("h/l or Left/Right  switch pane");
    expect(readme).not.toContain("Tab / Shift+Tab     cycle panes");
    expect(readme).toContain("but branch new <name>");
    expect(readme).toContain("but branch new <name> -a <anchor>");
  });
});
