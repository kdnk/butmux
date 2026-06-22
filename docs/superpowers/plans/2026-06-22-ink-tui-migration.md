# Ink TUI Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace butmux's Electron app with an Ink terminal UI while preserving core workspace-management and agent-hook behavior.

**Architecture:** Extract Electron IPC behavior into a UI-agnostic core app service. Route `butmux` without a subcommand to an Ink React TUI, while keeping `hook`, `notify`, and `open` as non-interactive subcommands. Store user settings in XDG config and registry state in XDG state.

**Tech Stack:** TypeScript, React 19, Ink 7, esbuild, Vitest, GitButler CLI, tmux, Kitty/WezTerm terminal backends.

## Global Constraints

- Use `git` for version control operations in this repository.
- Do not access GitHub URLs directly; use `gh` CLI for GitHub operations.
- Follow Conventional Commits with English commit messages and Why/What descriptions.
- Electron data migration is out of scope; ignore legacy Electron app data.
- Mouse support is not required; drag/drop is replaced by keyboard reorder.
- `butmux hook <agent> <event>`, `butmux notify <message>`, and `butmux open` must keep working.
- Managed tmux sessions use `bm_<project-slug>_<branch-key>`.
- Agent hook pane options use `@butmux_*`.
- `npm test` and `npm run build` must pass before completion.

---

### Task 1: XDG Config And Registry Paths

**Files:**
- Create: `src/core/paths.ts`
- Create: `src/core/config.ts`
- Modify: `src/core/registry.ts`
- Test: `tests/paths-config.test.ts`
- Test: `tests/registry.test.ts`

**Interfaces:**
- Produces: `resolveButmuxPaths(env, platform, home): ButmuxPaths`
- Produces: `loadConfig(configDir): Promise<ButmuxConfig>`
- Produces: `saveConfig(configDir, config): Promise<void>`
- Produces: `loadRegistry(stateDir): Promise<Registry>`
- Produces: `saveRegistry(stateDir, registry): Promise<void>`

- [ ] **Step 1: Write failing tests for XDG paths and config defaults**

Add tests that expect:

```ts
resolveButmuxPaths({ XDG_CONFIG_HOME: "/cfg", XDG_STATE_HOME: "/state" }, "linux", "/home/u")
```

to produce `/cfg/butmux` and `/state/butmux`, and that missing config loads `{ terminalBackend: "kitty" }`.

- [ ] **Step 2: Run the new tests and verify they fail**

Run: `npm test -- tests/paths-config.test.ts`

- [ ] **Step 3: Implement `paths.ts` and `config.ts`**

Use `node:path`, `node:fs/promises`, and the existing registry JSON style.

- [ ] **Step 4: Update registry tests and registry implementation**

Keep the current `loadRegistry(appDataDir)` call shape, but treat the argument as a state directory. Remove terminal backend settings from registry defaults.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- tests/paths-config.test.ts tests/registry.test.ts`

### Task 2: Core App Service

**Files:**
- Create: `src/core/app-service.ts`
- Modify: `src/core/model.ts`
- Test: `tests/app-service.test.ts`

**Interfaces:**
- Consumes: `loadRegistry`, `saveRegistry`, `loadConfig`, `saveConfig`, core commands/model helpers
- Produces: `createAppService(options): AppService`
- Produces: `readTerminalBackendSetting(config): TerminalBackendName`
- Produces: `orderedProjectRoots(registry): string[]`

- [ ] **Step 1: Write failing app-service tests**

Cover refresh, add project, remove project, reorder project, reorder context, settings read/update, empty rename validation, and sync warning collection with mocked command dependencies.

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `npm test -- tests/app-service.test.ts`

- [ ] **Step 3: Move Electron IPC logic into `app-service.ts`**

Port the reusable logic from `electron/main.ts` without importing Electron.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- tests/app-service.test.ts tests/core.test.ts`

### Task 3: CLI Routing And TUI Renderer Injection

**Files:**
- Modify: `src/cli.ts`
- Test: `tests/cli.test.ts`

**Interfaces:**
- Consumes: `resolveButmuxPaths`, `createAppService`
- Produces: `runCli(argv, deps): Promise<number>` where no subcommand calls `deps.renderTui`

- [ ] **Step 1: Write failing CLI tests**

Expect no subcommand to call `renderTui`, `open` to use the XDG state path, and existing `hook`/`notify` tests to keep passing.

- [ ] **Step 2: Run CLI tests and verify failure**

Run: `npm test -- tests/cli.test.ts`

- [ ] **Step 3: Update CLI routing**

Preserve injectable dependencies and add a production `renderTui` dependency that imports the Ink app.

- [ ] **Step 4: Run CLI tests**

Run: `npm test -- tests/cli.test.ts`

### Task 4: Ink TUI

**Files:**
- Create: `src/tui/App.tsx`
- Create: `src/tui/render.tsx`
- Create: `src/tui/state.ts`
- Create: `src/tui/keymap.ts`
- Test: `tests/tui-state.test.ts`

**Interfaces:**
- Consumes: `AppService`
- Produces: `renderTui(options): Promise<void>`
- Produces: reducer helpers for selection, pane switching, and reorder intent

- [ ] **Step 1: Write failing reducer/keymap tests**

Cover pane movement, selection clamping, and `[ / ]` reorder intent for project and context panes.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- tests/tui-state.test.ts`

- [ ] **Step 3: Implement TUI state helpers**

Keep helpers pure so they are easy to test.

- [ ] **Step 4: Implement Ink components**

Render projects, contexts, detail, warnings, busy state, help overlay, inline prompt, and confirmation text. Use `useInput` for keyboard handling.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- tests/tui-state.test.ts`

### Task 5: Remove Electron And Web Renderer

**Files:**
- Delete: `electron/main.ts`
- Delete: `electron/preload.ts`
- Delete: `electron/window-focus.ts`
- Delete: `src/renderer/App.tsx`
- Delete: `src/renderer/global.d.ts`
- Delete: `src/renderer/styles.css`
- Delete: `tests/electron-window-focus.test.ts`
- Delete: `tests/renderer.test.tsx`
- Delete: `index.html`
- Delete: `vite.config.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tsconfig.json`
- Modify: `scripts/build-cli.mjs`

**Interfaces:**
- Consumes: built CLI entrypoint
- Produces: package with no Electron/Vite renderer build

- [ ] **Step 1: Update dependencies and scripts**

Remove Electron/web dependencies and add Ink. Make `npm run build` typecheck and bundle the CLI.

- [ ] **Step 2: Delete Electron and renderer files**

Remove files that no longer participate in build or tests.

- [ ] **Step 3: Run install/update lockfile**

Run: `npm install`

- [ ] **Step 4: Run build**

Run: `npm run build`

### Task 6: README And Final Verification

**Files:**
- Modify: `README.md`
- Optional Modify: `AGENTS.md` only if implementation reveals durable repo-specific instructions

**Interfaces:**
- Produces: README matching terminal UI behavior

- [ ] **Step 1: Rewrite README**

Document terminal UI launch, keyboard controls, XDG paths, terminal backend config, hook/notify/open commands, build, and test.

- [ ] **Step 2: Run full tests**

Run: `npm test`

- [ ] **Step 3: Run full build**

Run: `npm run build`

- [ ] **Step 4: Inspect git diff**

Run: `git status --short` and `git diff --stat`.

- [ ] **Step 5: Commit implementation**

Commit with a Conventional Commit that explains Why and What.
