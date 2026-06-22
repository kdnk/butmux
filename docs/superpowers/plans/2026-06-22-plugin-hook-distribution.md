# Plugin Hook Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repo-provided Codex and Claude Code plugins that install butmux lifecycle hooks without editing each user's personal agent settings directly.

**Architecture:** Keep `butmux hook <agent> <event>` as the single runtime entrypoint. Add static plugin artifacts under `plugins/`, expose them through Codex and Claude marketplace metadata, and validate those files with repository tests. Hook commands are best-effort shell wrappers that no-op outside tmux or when `butmux` is unavailable.

**Tech Stack:** TypeScript, Vitest, JSON plugin manifests, Codex `.codex-plugin`, Claude Code `.claude-plugin`, shell command hooks.

## Global Constraints

- Use `git` for version control operations in this repository; do not use GitButler (`but`) unless the user explicitly changes that policy.
- Do not access GitHub URLs directly; use `gh` CLI for GitHub operations.
- Follow Conventional Commits with English commit messages and Why/What descriptions.
- Codex and Claude user-level settings remain owned by each runtime's plugin install flow.
- Plugin hook commands must not reference parent-relative paths, `dist/cli.js`, or files outside their plugin root.
- Hook commands must no-op with exit 0 when `TMUX_PANE` is missing.
- Hook commands must support `BUTMUX_BIN` and fall back to `butmux` from `PATH`.
- Existing `butmux hook <agent> <event>` behavior must not change.

---

## File Structure

- Create `.agents/plugins/marketplace.json`: Codex repo marketplace metadata.
- Create `.claude-plugin/marketplace.json`: Claude Code repo marketplace metadata.
- Create `plugins/codex-butmux/.codex-plugin/plugin.json`: Codex plugin manifest.
- Create `plugins/codex-butmux/hooks/hooks.json`: Codex lifecycle hook definitions.
- Create `plugins/claude-butmux/.claude-plugin/plugin.json`: Claude plugin manifest.
- Create `plugins/claude-butmux/hooks/hooks.json`: Claude lifecycle hook definitions.
- Create `tests/plugin-distribution.test.ts`: JSON artifact tests for marketplaces, manifests, and hook command coverage.
- Modify `README.md`: replace manual hook setup as the primary path with plugin installation and troubleshooting.
- Create `tests/readme-plugin-docs.test.ts`: README coverage for plugin installation and verification docs.
- Modify `package.json` and `package-lock.json`: bump package version for the shipped feature.

---

### Task 1: Add Codex Plugin Distribution

**Files:**
- Create: `tests/plugin-distribution.test.ts`
- Create: `.agents/plugins/marketplace.json`
- Create: `plugins/codex-butmux/.codex-plugin/plugin.json`
- Create: `plugins/codex-butmux/hooks/hooks.json`

**Interfaces:**
- Consumes: Existing CLI command `butmux hook codex <event>`.
- Produces: `codex-butmux` marketplace entry and Codex plugin hook definitions for later README documentation.

- [ ] **Step 1: Write the failing Codex plugin artifact tests**

Create `tests/plugin-distribution.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the Codex plugin artifact tests to verify they fail**

Run: `npm test -- tests/plugin-distribution.test.ts -t "Codex"`

Expected: FAIL with `ENOENT` for `.agents/plugins/marketplace.json` or the Codex plugin files.

- [ ] **Step 3: Add the Codex marketplace and plugin files**

Create `.agents/plugins/marketplace.json`:

```json
{
  "name": "butmux",
  "interface": {
    "displayName": "butmux"
  },
  "plugins": [
    {
      "name": "codex-butmux",
      "source": {
        "source": "local",
        "path": "./plugins/codex-butmux"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
    }
  ]
}
```

Create `plugins/codex-butmux/.codex-plugin/plugin.json`:

```json
{
  "name": "codex-butmux",
  "version": "0.1.0",
  "description": "Send Codex lifecycle hook state to butmux.",
  "author": {
    "name": "Kodai Nakamura"
  },
  "license": "MIT",
  "keywords": ["butmux", "codex", "hooks", "tmux"],
  "interface": {
    "displayName": "butmux for Codex",
    "shortDescription": "Send Codex pane status to butmux.",
    "longDescription": "Installs Codex lifecycle hooks that call butmux hook codex events so butmux can show Codex pane state in tmux-backed work contexts.",
    "developerName": "Kodai Nakamura",
    "category": "Productivity"
  }
}
```

Create `plugins/codex-butmux/hooks/hooks.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "sh -lc 'if [ -z \"${TMUX_PANE:-}\" ]; then exit 0; fi; bin=\"${BUTMUX_BIN:-butmux}\"; if command -v \"$bin\" >/dev/null 2>&1 || [ -x \"$bin\" ]; then exec \"$bin\" hook codex session-start; fi'"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "sh -lc 'if [ -z \"${TMUX_PANE:-}\" ]; then exit 0; fi; bin=\"${BUTMUX_BIN:-butmux}\"; if command -v \"$bin\" >/dev/null 2>&1 || [ -x \"$bin\" ]; then exec \"$bin\" hook codex user-prompt-submit; fi'"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "sh -lc 'if [ -z \"${TMUX_PANE:-}\" ]; then exit 0; fi; bin=\"${BUTMUX_BIN:-butmux}\"; if command -v \"$bin\" >/dev/null 2>&1 || [ -x \"$bin\" ]; then exec \"$bin\" hook codex stop; fi'"
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 4: Run the Codex plugin artifact tests to verify they pass**

Run: `npm test -- tests/plugin-distribution.test.ts -t "Codex"`

Expected: PASS for the Codex marketplace, manifest, and hook tests.

- [ ] **Step 5: Commit the Codex plugin artifacts**

```bash
git add .agents/plugins/marketplace.json \
  plugins/codex-butmux/.codex-plugin/plugin.json \
  plugins/codex-butmux/hooks/hooks.json \
  tests/plugin-distribution.test.ts
git commit -m "feat: add codex plugin hooks" -m "Why:
- Users should install butmux Codex hooks through Codex plugin management instead of manual hook-file edits.
- Plugin-bundled hooks keep hook review and enablement inside Codex.

What:
- add a repo Codex marketplace entry for codex-butmux
- add the Codex plugin manifest and lifecycle hook definitions
- add tests for plugin metadata and best-effort hook commands"
```

If the current branch is still `gitbutler/workspace` and `git commit` is blocked, stop before switching tools. Ask the user whether to move to a normal git branch or explicitly allow `but commit`.

---

### Task 2: Add Claude Code Plugin Distribution

**Files:**
- Modify: `tests/plugin-distribution.test.ts`
- Create: `.claude-plugin/marketplace.json`
- Create: `plugins/claude-butmux/.claude-plugin/plugin.json`
- Create: `plugins/claude-butmux/hooks/hooks.json`

**Interfaces:**
- Consumes: Existing CLI command `butmux hook claude <event>`.
- Produces: `claude-butmux` marketplace entry and Claude plugin hook definitions for later README documentation.

- [ ] **Step 1: Add failing Claude plugin artifact tests**

Append these tests inside the existing `describe("plugin distribution artifacts", () => { ... })` block in `tests/plugin-distribution.test.ts`:

```ts
  it("exposes the Claude butmux plugin through the repo marketplace", () => {
    const marketplace = readJson<{
      name: string;
      owner: { name: string };
      plugins: Array<{
        name: string;
        source: string;
        description: string;
        category: string;
      }>;
    }>(".claude-plugin/marketplace.json");

    expect(marketplace.name).toBe("butmux");
    expect(marketplace.owner.name).toBe("Kodai Nakamura");
    expect(marketplace.plugins).toEqual([
      {
        name: "claude-butmux",
        source: "./plugins/claude-butmux",
        description: "Send Claude Code lifecycle hook state to butmux.",
        category: "productivity"
      }
    ]);
  });

  it("defines a valid Claude plugin manifest", () => {
    const manifest = readJson<{
      name: string;
      version: string;
      description: string;
      author: { name: string };
      hooks?: unknown;
    }>("plugins/claude-butmux/.claude-plugin/plugin.json");

    expect(manifest.name).toBe("claude-butmux");
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.description).toContain("butmux");
    expect(manifest.author.name).toBe("Kodai Nakamura");
    expect(manifest).not.toHaveProperty("hooks");
  });

  it("provides best-effort Claude lifecycle hooks", () => {
    const hooksFile = readJson<HooksFile>("plugins/claude-butmux/hooks/hooks.json");

    expect(Object.keys(hooksFile.hooks).sort()).toEqual([
      "Notification",
      "PostToolUse",
      "SessionEnd",
      "SessionStart",
      "Stop",
      "StopFailure",
      "UserPromptSubmit"
    ]);

    const expectedEvents: Record<string, string> = {
      SessionStart: "session-start",
      UserPromptSubmit: "user-prompt-submit",
      Notification: "notification",
      Stop: "stop",
      StopFailure: "stop-failure",
      PostToolUse: "post-tool-use",
      SessionEnd: "session-end"
    };

    for (const [claudeEvent, butmuxEvent] of Object.entries(expectedEvents)) {
      const groups = hooksFile.hooks[claudeEvent];
      expect(groups).toHaveLength(1);
      expect(groups?.[0]?.hooks).toHaveLength(1);
      const hook = groups?.[0]?.hooks[0];
      expect(hook?.type).toBe("command");
      expectBestEffortHookCommand(hook?.command ?? "", "claude", butmuxEvent);
    }

    expect(collectCommands(hooksFile)).toHaveLength(7);
  });
```

- [ ] **Step 2: Run the Claude plugin artifact tests to verify they fail**

Run: `npm test -- tests/plugin-distribution.test.ts -t "Claude"`

Expected: FAIL with `ENOENT` for `.claude-plugin/marketplace.json` or the Claude plugin files.

- [ ] **Step 3: Add the Claude marketplace and plugin files**

Create `.claude-plugin/marketplace.json`:

```json
{
  "name": "butmux",
  "owner": {
    "name": "Kodai Nakamura"
  },
  "plugins": [
    {
      "name": "claude-butmux",
      "source": "./plugins/claude-butmux",
      "description": "Send Claude Code lifecycle hook state to butmux.",
      "category": "productivity"
    }
  ]
}
```

Create `plugins/claude-butmux/.claude-plugin/plugin.json`:

```json
{
  "name": "claude-butmux",
  "version": "0.1.0",
  "description": "Send Claude Code lifecycle hook state to butmux.",
  "author": {
    "name": "Kodai Nakamura"
  },
  "license": "MIT"
}
```

Create `plugins/claude-butmux/hooks/hooks.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "sh -lc 'if [ -z \"${TMUX_PANE:-}\" ]; then exit 0; fi; bin=\"${BUTMUX_BIN:-butmux}\"; if command -v \"$bin\" >/dev/null 2>&1 || [ -x \"$bin\" ]; then exec \"$bin\" hook claude session-start; fi'"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "sh -lc 'if [ -z \"${TMUX_PANE:-}\" ]; then exit 0; fi; bin=\"${BUTMUX_BIN:-butmux}\"; if command -v \"$bin\" >/dev/null 2>&1 || [ -x \"$bin\" ]; then exec \"$bin\" hook claude user-prompt-submit; fi'"
          }
        ]
      }
    ],
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "sh -lc 'if [ -z \"${TMUX_PANE:-}\" ]; then exit 0; fi; bin=\"${BUTMUX_BIN:-butmux}\"; if command -v \"$bin\" >/dev/null 2>&1 || [ -x \"$bin\" ]; then exec \"$bin\" hook claude notification; fi'"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "sh -lc 'if [ -z \"${TMUX_PANE:-}\" ]; then exit 0; fi; bin=\"${BUTMUX_BIN:-butmux}\"; if command -v \"$bin\" >/dev/null 2>&1 || [ -x \"$bin\" ]; then exec \"$bin\" hook claude stop; fi'"
          }
        ]
      }
    ],
    "StopFailure": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "sh -lc 'if [ -z \"${TMUX_PANE:-}\" ]; then exit 0; fi; bin=\"${BUTMUX_BIN:-butmux}\"; if command -v \"$bin\" >/dev/null 2>&1 || [ -x \"$bin\" ]; then exec \"$bin\" hook claude stop-failure; fi'"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "sh -lc 'if [ -z \"${TMUX_PANE:-}\" ]; then exit 0; fi; bin=\"${BUTMUX_BIN:-butmux}\"; if command -v \"$bin\" >/dev/null 2>&1 || [ -x \"$bin\" ]; then exec \"$bin\" hook claude post-tool-use; fi'"
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "sh -lc 'if [ -z \"${TMUX_PANE:-}\" ]; then exit 0; fi; bin=\"${BUTMUX_BIN:-butmux}\"; if command -v \"$bin\" >/dev/null 2>&1 || [ -x \"$bin\" ]; then exec \"$bin\" hook claude session-end; fi'"
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 4: Run the plugin artifact tests to verify Codex and Claude pass**

Run: `npm test -- tests/plugin-distribution.test.ts`

Expected: PASS for all plugin distribution artifact tests.

- [ ] **Step 5: Commit the Claude plugin artifacts**

```bash
git add .claude-plugin/marketplace.json \
  plugins/claude-butmux/.claude-plugin/plugin.json \
  plugins/claude-butmux/hooks/hooks.json \
  tests/plugin-distribution.test.ts
git commit -m "feat: add claude plugin hooks" -m "Why:
- Claude Code users need the same butmux pane status integration without hand-editing settings files.
- Claude plugin hooks keep install, enablement, and review inside Claude Code.

What:
- add a Claude marketplace entry for claude-butmux
- add the Claude plugin manifest and lifecycle hook definitions
- extend plugin distribution tests for Claude metadata and hooks"
```

If the current branch is still `gitbutler/workspace` and `git commit` is blocked, stop before switching tools. Ask the user whether to move to a normal git branch or explicitly allow `but commit`.

---

### Task 3: Document Plugin-Based Hook Setup

**Files:**
- Create: `tests/readme-plugin-docs.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: Codex plugin name `codex-butmux`, Claude plugin name `claude-butmux`, marketplace name `butmux`.
- Produces: User-facing installation, verification, fallback manual setup, and troubleshooting documentation.

- [ ] **Step 1: Write the failing README coverage test**

Create `tests/readme-plugin-docs.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the README coverage test to verify it fails**

Run: `npm test -- tests/readme-plugin-docs.test.ts`

Expected: FAIL because `README.md` does not yet contain `## Plugin Hook Setup` and still presents manual Codex config as the primary setup.

- [ ] **Step 3: Replace the manual-first hook docs with plugin-first setup**

In `README.md`, keep the existing `## Agent Integration` introduction and supported events. Replace the `## Codex Hooks` and `## Claude Hooks` sections with this structure:

````md
## Plugin Hook Setup

butmux provides Codex and Claude Code plugins in this repository. The plugins
install lifecycle hooks that call `butmux hook <agent> <event>` without butmux
editing your personal `~/.codex` or `~/.claude` settings files directly.

Install the butmux CLI first:

```bash
npm install -g butmux
```

For local development, `npm link` is also fine as long as `butmux` resolves on
`PATH`:

```bash
command -v butmux
```

If `butmux` is not on `PATH`, set `BUTMUX_BIN` to an executable path before
starting Codex or Claude Code:

```bash
export BUTMUX_BIN=/absolute/path/to/butmux
```

### Codex Plugin

The Codex marketplace file is:

```text
.agents/plugins/marketplace.json
```

Install the `codex-butmux` plugin from the `butmux` marketplace in Codex, then
start a new Codex session. Use `/hooks` in Codex to review and trust the plugin
hooks if Codex asks for hook review.

The plugin provides:

```text
SessionStart      -> butmux hook codex session-start
UserPromptSubmit  -> butmux hook codex user-prompt-submit
Stop              -> butmux hook codex stop
```

### Claude Code Plugin

The Claude Code marketplace file is:

```text
.claude-plugin/marketplace.json
```

Add this repository as a Claude Code plugin marketplace, install
`claude-butmux`, then run `/reload-plugins` or start a new Claude Code session.
Use `/hooks` in Claude Code to inspect the installed hook definitions.

The plugin provides:

```text
SessionStart      -> butmux hook claude session-start
UserPromptSubmit  -> butmux hook claude user-prompt-submit
Notification      -> butmux hook claude notification
Stop              -> butmux hook claude stop
StopFailure       -> butmux hook claude stop-failure
PostToolUse       -> butmux hook claude post-tool-use
SessionEnd        -> butmux hook claude session-end
```

### Verify Hook Status

Run Codex or Claude Code inside a tmux pane, then start or resume a session. The
plugin hooks intentionally no-op when `TMUX_PANE` is missing, so sessions outside
tmux will not update butmux pane state.

In another pane, open:

```bash
butmux
```

The selected context should show the active Codex or Claude pane after the first
hook event fires.

### Troubleshooting Hooks

- Check `command -v butmux`, or set `BUTMUX_BIN`.
- Confirm the agent session is running inside tmux so `TMUX_PANE` is present.
- Open `/hooks` in Codex or Claude Code and confirm the plugin hooks are enabled
  and trusted.
- Check whether hooks are disabled by user, project, or managed policy.
- Confirm the plugin is installed and enabled.

## Manual Hook Reference

The plugin setup above is preferred. Manual hook configuration is still possible
if you do not want to use plugins.

Codex commands:

```text
butmux hook codex session-start
butmux hook codex user-prompt-submit
butmux hook codex stop
```

Claude Code commands:

```text
butmux hook claude session-start
butmux hook claude user-prompt-submit
butmux hook claude notification
butmux hook claude stop
butmux hook claude stop-failure
butmux hook claude post-tool-use
butmux hook claude session-end
```
````

- [ ] **Step 4: Run the README coverage test to verify it passes**

Run: `npm test -- tests/readme-plugin-docs.test.ts`

Expected: PASS for both README documentation tests.

- [ ] **Step 5: Commit the README updates**

```bash
git add README.md tests/readme-plugin-docs.test.ts
git commit -m "docs: describe plugin hook setup" -m "Why:
- Plugin installation is now the primary hook setup path for Codex and Claude Code.
- Users need verification and troubleshooting steps that do not tell butmux to own personal agent settings.

What:
- document Codex and Claude plugin marketplace locations and plugin names
- add verification and troubleshooting guidance for PATH, TMUX_PANE, hook trust, and policy
- keep manual hook commands as a fallback reference"
```

If the current branch is still `gitbutler/workspace` and `git commit` is blocked, stop before switching tools. Ask the user whether to move to a normal git branch or explicitly allow `but commit`.

---

### Task 4: Bump Version And Run Full Verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: Completed plugin artifacts and README docs.
- Produces: Package metadata that reflects the new shipped plugin distribution feature.

- [ ] **Step 1: Write the failing package version expectation**

Modify the second test in `tests/release-workflow.test.ts` so it also reads and checks the package version:

```ts
  it("allows the package to be published to npm", () => {
    const packageJson = JSON.parse(readFileSync(`${repoRoot}/package.json`, "utf8")) as {
      private?: boolean;
      version?: string;
      repository?: {
        type?: string;
        url?: string;
      };
    };

    expect(packageJson.private).not.toBe(true);
    expect(packageJson.version).toBe("0.4.0");
    expect(packageJson.repository).toEqual({
      type: "git",
      url: "https://github.com/kdnk/butmux"
    });
  });
```

- [ ] **Step 2: Run the release workflow test to verify it fails**

Run: `npm test -- tests/release-workflow.test.ts -t "allows the package"`

Expected: FAIL because `packageJson.version` is still `0.3.1`.

- [ ] **Step 3: Bump package metadata to `0.4.0`**

Run:

```bash
npm version 0.4.0 --no-git-tag-version
```

Expected file changes:

- `package.json` version changes from `0.3.1` to `0.4.0`
- `package-lock.json` root package version changes from `0.3.1` to `0.4.0`
- `package-lock.json` package entry for the root changes from `0.3.1` to `0.4.0`

- [ ] **Step 4: Run the release workflow test to verify it passes**

Run: `npm test -- tests/release-workflow.test.ts -t "allows the package"`

Expected: PASS for the package publishability test.

- [ ] **Step 5: Run all tests**

Run: `npm test`

Expected: PASS for all Vitest suites.

- [ ] **Step 6: Run the production build**

Run: `npm run build`

Expected: PASS with TypeScript typecheck and CLI bundle generation.

- [ ] **Step 7: Check for whitespace errors**

Run: `git diff --check`

Expected: no output and exit 0.

- [ ] **Step 8: Commit the version bump and final verification**

```bash
git add package.json package-lock.json tests/release-workflow.test.ts
git commit -m "chore: bump package for plugin distribution" -m "Why:
- The release now ships Codex and Claude plugin hook distribution artifacts.
- Package metadata should identify the feature-bearing release.

What:
- bump package metadata to 0.4.0
- assert the expected release version in package publishability coverage
- run full test and build verification"
```

If the current branch is still `gitbutler/workspace` and `git commit` is blocked, stop before switching tools. Ask the user whether to move to a normal git branch or explicitly allow `but commit`.

---

## Self-Review

- Spec coverage: The plan covers separate Codex and Claude plugin directories, both marketplace files, bundled hook definitions, best-effort `BUTMUX_BIN` / `TMUX_PANE` behavior, README docs, tests, and release versioning.
- Placeholder scan: No unresolved placeholder markers remain.
- Type consistency: `HooksFile`, `HookGroup`, `collectCommands`, and `expectBestEffortHookCommand` are defined before use and reused consistently across Codex and Claude tests.
- Known execution blocker: Current repository state may block `git commit` on `gitbutler/workspace`. The plan preserves the repo instruction to use `git` and stops at commit steps unless the user explicitly authorizes a version-control policy change.
