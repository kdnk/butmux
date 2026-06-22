import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

describe("npm publish workflow", () => {
  it("publishes package releases from tags with provenance", () => {
    const workflow = readFileSync(`${repoRoot}/.github/workflows/release.yml`, "utf8");

    expect(workflow).toContain("name: npm publish");
    expect(workflow).toContain("tags:");
    expect(workflow).toContain("- '*'");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("node-version: '24'");
    expect(workflow).toContain("registry-url: 'https://registry.npmjs.org'");
    expect(workflow).toContain("npm ci");
    expect(workflow).toContain("npm run build");
    expect(workflow).toContain("npm publish --access public --provenance");
    expect(workflow).not.toContain("NODE_AUTH_TOKEN");
    expect(workflow).not.toContain("NPM_TOKEN");
  });

  it("allows the package to be published to npm", () => {
    const packageJson = JSON.parse(readFileSync(`${repoRoot}/package.json`, "utf8")) as {
      private?: boolean;
    };

    expect(packageJson.private).not.toBe(true);
  });
});
