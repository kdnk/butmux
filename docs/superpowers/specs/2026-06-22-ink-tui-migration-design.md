# Ink TUI Migration Design

## Goal

Replace Seiton's Electron application with a TypeScript Ink terminal UI while preserving the existing GitButler, tmux, terminal-backend, workspace-session, and coding-agent status workflows.

After this change:

- running `seiton` without a subcommand opens the terminal UI
- `seiton hook <agent> <event>`, `seiton notify <message>`, and `seiton open` continue to work for agent integration and shell workflows
- Electron, Vite renderer code, Electron packaging, and Electron-specific tests are removed
- project/context ordering remains supported through keyboard reorder instead of drag and drop

## Why

Seiton's core purpose is managing terminal-based work contexts. A terminal UI fits that workflow better than an Electron window, avoids separate app packaging, and keeps the tool close to tmux, Kitty, WezTerm, GitButler, Codex, and Claude Code.

The existing code already separates much of the domain logic into `src/core`, so the migration should reuse that logic instead of rewriting the GitButler, tmux, terminal, and agent detection behavior.

## Scope

This design changes:

- application entrypoint behavior in `src/cli.ts`
- persistence paths for user configuration and registry state
- Electron IPC handlers into a reusable core service
- user interface from React DOM to Ink
- package dependencies, build scripts, tests, and README

This design does not change:

- managed tmux session naming
- GitButler branch detection and rename behavior
- supported terminal backends, which remain `kitty` and `wezterm`
- hook payload parsing or tmux pane option names
- plugin distribution for Codex or Claude Code; that remains a future design

## User Experience

### Launch

`seiton` with no subcommand starts the Ink terminal UI.

The existing non-interactive commands remain:

```text
seiton hook <agent> <event>
seiton notify <message>
seiton open
```

### Layout

The default layout is a three-pane dashboard:

```text
Projects | Contexts | Detail
```

The Projects pane lists registered projects in registry order.

The Contexts pane shows the selected project's workspace session first, followed by managed branch contexts in registry order.

The Detail pane shows warnings, selected item details, and agent panes.

On narrow terminals, the UI may reduce detail density, but it must keep the projects and contexts workflow usable.

### Keyboard

The UI is keyboard-first. Mouse support is not required.

Required keys:

```text
j/k or Up/Down     move selection
h/l or Left/Right  switch pane
Enter              focus selected workspace, context, or pane
r                  refresh
s                  sync selected project or all projects from the project pane
a                  add project
n                  rename selected managed context
x                  remove selected project or orphan context after confirmation
c                  create selected project's workspace session
[ / ]              reorder selected project or context
?                  show help
q or Ctrl+C        quit
```

Drag and drop is intentionally removed. Project and context ordering is handled by `[ / ]`.

### Prompts And Confirmation

Inline prompts are used for path entry, context rename, and destructive confirmations.

Removing a project or orphan context requires confirmation. Rename rejects empty names before calling GitButler.

## Architecture

### Files

Recommended structure:

```text
src/cli.ts
src/tui/App.tsx
src/tui/state.ts
src/tui/keymap.ts
src/tui/components/*
src/core/app-service.ts
src/core/paths.ts
src/core/config.ts
src/core/registry.ts
src/core/commands.ts
src/core/model.ts
```

### App Service

Move the reusable behavior from `electron/main.ts` into `src/core/app-service.ts`.

The service owns application operations:

- refresh state
- sync all projects
- sync one project
- add project root
- remove project root
- create workspace session
- focus workspace session
- focus managed context
- rename managed context
- remove orphan context
- reorder projects
- reorder contexts
- read settings
- update settings

The service must not depend on Electron or Ink. It should accept explicit paths and dependencies where useful so tests can run with temporary directories and mocked command functions.

Recommended public shape:

```ts
export type AppState = {
  projectsWithContexts: ProjectContexts[];
  warnings: string[];
};

export type AppService = {
  refresh(): Promise<AppState>;
  sync(): Promise<AppState & { commands: SyncCommand[] }>;
  syncProject(root: string): Promise<AppState & { commands: SyncCommand[] }>;
  addProjectRoot(root: string): Promise<AppState>;
  removeProjectRoot(root: string): Promise<AppState>;
  createWorkspaceSession(projectRoot: string): Promise<AppState>;
  focusContext(input: { projectRoot: string; branchKey: string; paneId?: string }): Promise<void>;
  focusWorkspaceSession(input: { projectRoot: string; paneId?: string }): Promise<void>;
  renameContext(input: RenameContextInput): Promise<AppState>;
  removeOrphan(input: RemoveOrphanInput): Promise<AppState>;
  reorderProjects(from: number, to: number): Promise<AppState>;
  reorderContexts(projectRoot: string, from: number, to: number): Promise<AppState>;
  getSettings(): Promise<SeitonConfig>;
  updateSettings(input: Partial<SeitonConfig>): Promise<SeitonConfig>;
};
```

The exact signatures may vary, but the boundary must keep UI code out of domain operations.

### CLI Entrypoint

`src/cli.ts` routes commands:

- no subcommand: render the Ink TUI
- `hook`: keep current hook behavior
- `notify`: keep current notify behavior
- `open`: add `cwd` as a project using the XDG registry and emit a live update
- unsupported command: print usage and exit 1

The CLI entrypoint should keep dependency injection for tests.

### TUI State

The Ink app keeps UI-only state:

- selected pane
- selected project index
- selected context/detail index
- active prompt or confirmation
- busy action label
- last sync summary
- transient error message

Domain state comes from `AppService.refresh()` and action results.

Live updates should refresh the TUI with a short debounce, reusing `watchLiveUpdates` where appropriate.

## Persistence

Seiton uses XDG paths only. Legacy Electron app data is ignored.

```text
${XDG_CONFIG_HOME:-~/.config}/seiton/config.json
${XDG_STATE_HOME:-~/.local/state}/seiton/registry.json
```

`config.json` stores user settings:

```json
{
  "terminalBackend": "kitty"
}
```

`registry.json` stores projects and contexts:

```json
{
  "projects": [],
  "contexts": []
}
```

`terminalBackend` supports:

- `kitty`
- `wezterm`

If `config.json` is missing, default to `kitty`.

If `registry.json` is missing, default to an empty registry.

`Registry.settings` can be removed or ignored after config support lands. The terminal backend source of truth is `config.json`.

## Error Handling

Command failures should not crash the TUI when the app can continue.

Rules:

- snapshot read failures become global or project warnings
- sync command failures are collected as project warnings and remaining sync work continues
- focus failures are shown as transient TUI errors
- rename conflicts are shown as transient TUI errors
- destructive actions require confirmation
- non-interactive CLI commands keep normal exit-code behavior

## Build And Dependencies

Add runtime dependencies:

- `ink`
- any small Ink input helper only if needed

Keep:

- `react`
- TypeScript
- esbuild
- vitest

Remove Electron/web dependencies that are no longer used:

- `electron`
- `electron-builder`
- Vite and React DOM renderer dependencies
- Radix Themes
- React DnD
- React Icons
- Testing Library DOM/React packages if no longer used
- jsdom if no remaining test needs it

Build output should produce a Node executable with a shebang, similar to the existing CLI build.

## Tests

Use TDD for behavior changes.

Required test coverage:

- XDG path resolution honors `XDG_CONFIG_HOME`, `XDG_STATE_HOME`, and home fallbacks
- config loading defaults to `kitty`, parses `wezterm`, and saves JSON
- registry loading and saving uses the state path
- app service refresh builds `AppState` from registry and snapshots
- app service reorder persists project/context ordering
- app service rename validates empty names and conflict cases
- CLI no-subcommand renders TUI through an injectable renderer
- CLI `open`, `hook`, and `notify` continue to route correctly
- TUI key handling triggers refresh, sync, focus, reorder, and prompt actions through mocked service calls

Existing core model and command tests remain.

Renderer and Electron tests are deleted or replaced.

Verification commands:

```bash
npm test
npm run build
```

## Documentation

Rewrite README around the terminal UI.

Required README topics:

- requirements
- install
- run `seiton`
- keyboard controls
- XDG config and state paths
- terminal backend configuration
- hook/notify/open integration
- build and test commands

Remove Electron app, app quarantine, Settings modal, and Electron packaging docs.

## Rollout

This is a direct migration for a single-user tool. There is no Electron data migration.

The implementation is complete when:

- `seiton` launches the Ink TUI by default
- existing hook/notify/open commands still work
- Electron files and package metadata are gone
- README describes the terminal UI
- `npm test` passes
- `npm run build` passes
