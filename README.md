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

## Codex Hooks

Enable hooks in `~/.codex/config.toml`:

```toml
[features]
hooks = true
```

Add commands to `~/.codex/hooks.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "butmux hook codex session-start"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "butmux hook codex user-prompt-submit"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "butmux hook codex stop"
          }
        ]
      }
    ]
  }
}
```

If `butmux` is not on `PATH`, use an absolute checkout path:

```json
{
  "type": "command",
  "command": "cd /ABS/PATH/TO/BUTMUX && ./dist/cli.js hook codex stop"
}
```

## Claude Hooks

Claude hooks call the same CLI entrypoint with `claude` as the agent name:

```text
butmux hook claude session-start
butmux hook claude user-prompt-submit
butmux hook claude notification
butmux hook claude stop
butmux hook claude stop-failure
butmux hook claude post-tool-use
butmux hook claude session-end
```

Add matching commands to `~/.claude/settings.json` or a project-local `.claude/settings.json`.

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
