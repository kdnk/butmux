import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("README TUI docs", () => {
  it("documents lazy-style navigation and branch creation shortcuts", async () => {
    const readme = await readFile("README.md", "utf8");

    expect(readme).toContain("Tab / Shift+Tab");
    expect(readme).toContain("b                   create independent branch");
    expect(readme).toContain("B                   create dependent branch from selected context");
    expect(readme).toContain("but branch new <name>");
    expect(readme).toContain("but branch new <name> -a <anchor>");
  });
});
