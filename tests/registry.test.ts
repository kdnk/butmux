import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { loadRegistry, saveRegistry } from "../src/core/registry";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("registry persistence", () => {
  it("returns an empty registry when the file does not exist", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "butmux-registry-"));

    await expect(loadRegistry(tempDir)).resolves.toEqual({
      projects: [],
      contexts: []
    });
  });

  it("saves registry JSON under the app data directory", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "butmux-registry-"));

    await saveRegistry(tempDir, {
      projects: [
        {
          root: "/repo/a",
          name: "a",
          projectKey: "%2Frepo%2Fa",
          order: 10,
          enabled: true,
          createdAt: "2026-04-24T10:00:00+09:00",
          updatedAt: "2026-04-24T10:00:00+09:00"
        }
      ],
      contexts: [
        {
          id: "ctx-1",
          projectRoot: "/repo/a",
          branch: "feature/a",
          branchKey: "feature%2Fa",
          tmuxSession: "bm_a_feature%2Fa",
          terminalTabTitle: "bm_a_feature%2Fa",
          order: 10,
          createdAt: "2026-04-24T10:00:00+09:00",
          updatedAt: "2026-04-24T10:00:00+09:00"
        }
      ]
    });

    const raw = await readFile(join(tempDir, "registry.json"), "utf8");
    expect(JSON.parse(raw)).toMatchObject({
      projects: [{ root: "/repo/a", order: 10 }],
      contexts: [{ branch: "feature/a", order: 10 }]
    });
    await expect(loadRegistry(tempDir)).resolves.toMatchObject({
      projects: [{ root: "/repo/a", order: 10 }],
      contexts: [{ branch: "feature/a", order: 10 }]
    });
  });

  it("drops the filesystem root and its scoped contexts when loading", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "butmux-registry-"));

    await saveRegistry(tempDir, {
      projects: [
        {
          root: "/repo/a",
          name: "a",
          projectKey: "%2Frepo%2Fa",
          order: 10,
          enabled: true
        },
        {
          root: "/",
          name: "/",
          projectKey: "%2F",
          order: 20,
          enabled: true
        }
      ],
      contexts: [
        {
          id: "ctx-valid",
          projectRoot: "/repo/a",
          branch: "feature/a",
          branchKey: "feature%2Fa",
          tmuxSession: "bm_a_feature%2Fa",
          terminalTabTitle: "bm_a_feature%2Fa",
          order: 10,
          createdAt: "2026-04-24T10:00:00+09:00",
          updatedAt: "2026-04-24T10:00:00+09:00"
        },
        {
          id: "ctx-root",
          projectRoot: "/",
          branch: "feature/root",
          branchKey: "feature%2Froot",
          tmuxSession: "bm_root_feature%2Froot",
          terminalTabTitle: "bm_root_feature%2Froot",
          order: 20,
          createdAt: "2026-04-24T10:00:00+09:00",
          updatedAt: "2026-04-24T10:00:00+09:00"
        }
      ]
    });

    await expect(loadRegistry(tempDir)).resolves.toEqual({
      projects: [
        expect.objectContaining({ root: "/repo/a", order: 10 })
      ],
      contexts: [
        expect.objectContaining({ id: "ctx-valid", projectRoot: "/repo/a" })
      ]
    });
  });

  it("loads legacy kitty tab titles into terminal tab titles", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "butmux-registry-"));

    await saveRegistry(tempDir, {
      projects: [
        {
          root: "/repo/a",
          name: "a",
          projectKey: "%2Frepo%2Fa",
          order: 10,
          enabled: true
        }
      ],
      contexts: [
        {
          id: "ctx-legacy",
          projectRoot: "/repo/a",
          branch: "feature/a",
          branchKey: "feature%2Fa",
          tmuxSession: "bm_a_feature%2Fa",
          // legacy persisted key
          kittyTabTitle: "bm_a_feature%2Fa",
          order: 10,
          createdAt: "2026-04-24T10:00:00+09:00",
          updatedAt: "2026-04-24T10:00:00+09:00"
        } as never
      ]
    });

    await expect(loadRegistry(tempDir)).resolves.toMatchObject({
      contexts: [
        expect.objectContaining({
          id: "ctx-legacy",
          terminalTabTitle: "bm_a_feature%2Fa"
        })
      ]
    });
  });
});
