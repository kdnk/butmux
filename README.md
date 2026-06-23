# butmux

butmux is a terminal UI for managing GitButler branches as real tmux and terminal work contexts.

It gives you one place to:

- add and switch project directories
- create independent or dependent GitButler branches from the TUI
- sync GitButler branches into managed tmux sessions and terminal tabs
- focus a context, workspace session, or agent pane
- rename contexts across GitButler, tmux, and the selected terminal backend
- reorder projects and contexts from the keyboard
- remove orphan tmux and terminal state
- inspect Codex and Claude panes per context

## Requirements

- macOS or Linux
- Node.js
- `tmux`
- `but` (GitButler CLI)
- `kitty` with remote control enabled, or `wezterm`

butmux assumes working contexts are backed by:

- GitButler branch state
- tmux sessions
- terminal tabs in Kitty or WezTerm

## Install

```bash
npm install
npm run build
```

During local development, run the built command directly:

```bash
./dist/cli.js
```

To expose `butmux` on `PATH`, use your preferred Node/package workflow, for example:

```bash
npm link
```

## Run

Start the terminal UI:

```bash
butmux
```

Add the current directory from a shell:

```bash
butmux open
```

## Keyboard

```text
j/k or Up/Down     move selection
h/l or Left/Right  switch pane
Tab / Shift+Tab     cycle panes
Enter              focus selected workspace, context, or pane
r                  refresh
s                  sync selected project
a                  add project path
b                   create independent branch
B                   create dependent branch from selected context
n                  rename selected managed context
x                  remove selected project or orphan context after confirmation
c                  create selected project's workspace session
[ / ]              reorder selected project or context
,                  cycle terminal backend
?                  show help
q or Ctrl+C        quit
```

## Branch Creation

Use `b` to create a new independent GitButler branch for the selected project.
butmux runs:

```text
but branch new <name>
```

Use `B` from a managed context row to create a dependent branch anchored to the
selected branch. butmux uses the selected GitButler branch id when available and
falls back to the branch name. It runs:

```text
but branch new <name> -a <anchor>
```

After creation, butmux syncs the project so the new branch gets its managed
context, tmux session, and terminal tab.

## Configuration

butmux stores user settings under XDG config:

```text
${XDG_CONFIG_HOME:-~/.config}/butmux/config.json
```

Example:

```json
{
  "terminalBackend": "kitty"
}
```

Supported terminal backends:

- `kitty`
- `wezterm`

If the config file is missing, butmux defaults to `kitty`.

## State

butmux stores projects, contexts, and ordering under XDG state:

```text
${XDG_STATE_HOME:-~/.local/state}/butmux/registry.json
```

Example shape:

```json
{
  "projects": [],
  "contexts": []
}
```

## How butmux Works

For each GitButler branch in a registered project, butmux manages:

- one tmux session
- one terminal tab
- one registry entry for ordering and persistence

Managed names use this shape:

```text
bm_<project-slug>_<branch-key>
```

Examples:

- `git-butler-practice` + `butmux-parser-test` -> `bm_gbp_butmux-parser-test`
- `butmux` + `kn-branch-1` -> `bm_butmux_kn-branch-1`

Each project can also have a workspace session. Its tmux session name is the project directory basename, for example `/repo/butmux` -> `butmux`.

## Agent Integration

butmux supports Codex and Claude status updates through tmux pane options.

The intended flow is:

```text
Agent hook -> butmux hook <agent> <event> -> tmux pane options -> butmux TUI refresh
```

### Supported Codex Events

- `SessionStart`
- `UserPromptSubmit`
- `Stop`

These map to:

- `session-start`
- `user-prompt-submit`
- `stop`

### Supported Claude Events

- `SessionStart`
- `UserPromptSubmit`
- `Notification`
- `Stop`
- `StopFailure`
- `PostToolUse`
- `SessionEnd`

### tmux Pane Options

butmux writes and reads these pane options:

- `@butmux_agent`
- `@butmux_status`
- `@butmux_prompt`
- `@butmux_cwd`
- `@butmux_started_at`
- `@butmux_attention`
- `@butmux_wait_reason`

Pane status values:

- `idle`
- `running`
- `waiting`
- `error`

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

## Manual Notifications

Use `butmux notify` inside a tmux pane when you need to raise a waiting state manually:

```bash
butmux notify "implementation finished"
```

## Build

```bash
npm run build
```

This typechecks the project and builds:

```text
dist/cli.js
```

## Test

```bash
npm test
```

## Operational Notes

- If `but status -fv` reports `Setup required: No GitButler project found`, butmux runs `but setup` and retries.
- If a terminal tab is missing during focus, butmux creates one.
- If a tmux session is missing during focus, butmux creates one.
- If a target pane lives in another tmux window, butmux switches to that window before selecting the pane.
- Orphan cleanup removes both the tmux session and matching terminal tab.

## Development Notes

Important files:

- [src/cli.ts](./src/cli.ts)
- [src/tui/App.tsx](./src/tui/App.tsx)
- [src/core/app-service.ts](./src/core/app-service.ts)
- [src/core/commands.ts](./src/core/commands.ts)
- [src/core/model.ts](./src/core/model.ts)

Specs and plans:

- [Ink TUI migration design](./docs/superpowers/specs/2026-06-22-ink-tui-migration-design.md)
- [Ink TUI migration plan](./docs/superpowers/plans/2026-06-22-ink-tui-migration.md)
- [Lazy-inspired TUI design](./docs/superpowers/specs/2026-06-22-lazy-inspired-tui-design.md)
- [Lazy-inspired TUI plan](./docs/superpowers/plans/2026-06-22-lazy-inspired-tui.md)
