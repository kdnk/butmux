# seiton

Seiton is a terminal UI for managing GitButler branches as real tmux and terminal work contexts.

It gives you one place to:

- add and switch project directories
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

Seiton assumes working contexts are backed by:

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

To expose `seiton` on `PATH`, use your preferred Node/package workflow, for example:

```bash
npm link
```

## Run

Start the terminal UI:

```bash
seiton
```

Add the current directory from a shell:

```bash
seiton open
```

## Keyboard

```text
j/k or Up/Down     move selection
h/l or Left/Right  switch pane
Enter              focus selected workspace, context, or pane
r                  refresh
s                  sync selected project
a                  add project path
n                  rename selected managed context
x                  remove selected project or orphan context after confirmation
c                  create selected project's workspace session
[ / ]              reorder selected project or context
,                  cycle terminal backend
?                  show help
q or Ctrl+C        quit
```

## Configuration

Seiton stores user settings under XDG config:

```text
${XDG_CONFIG_HOME:-~/.config}/seiton/config.json
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

If the config file is missing, Seiton defaults to `kitty`.

## State

Seiton stores projects, contexts, and ordering under XDG state:

```text
${XDG_STATE_HOME:-~/.local/state}/seiton/registry.json
```

Example shape:

```json
{
  "projects": [],
  "contexts": []
}
```

## How Seiton Works

For each GitButler branch in a registered project, Seiton manages:

- one tmux session
- one terminal tab
- one registry entry for ordering and persistence

Managed names use this shape:

```text
s_<project-slug>_<branch-key>
```

Examples:

- `git-butler-practice` + `seiton-parser-test` -> `s_gbp_seiton-parser-test`
- `seiton` + `kn-branch-1` -> `s_seiton_kn-branch-1`

Each project can also have a workspace session. Its tmux session name is the project directory basename, for example `/repo/seiton` -> `seiton`.

## Agent Integration

Seiton supports Codex and Claude status updates through tmux pane options.

The intended flow is:

```text
Agent hook -> seiton hook <agent> <event> -> tmux pane options -> Seiton TUI refresh
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

Seiton writes and reads these pane options:

- `@seiton_agent`
- `@seiton_status`
- `@seiton_prompt`
- `@seiton_cwd`
- `@seiton_started_at`
- `@seiton_attention`
- `@seiton_wait_reason`

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
            "command": "seiton hook codex session-start"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "seiton hook codex user-prompt-submit"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "seiton hook codex stop"
          }
        ]
      }
    ]
  }
}
```

If `seiton` is not on `PATH`, use an absolute checkout path:

```json
{
  "type": "command",
  "command": "cd /ABS/PATH/TO/SEITON && ./dist/cli.js hook codex stop"
}
```

## Claude Hooks

Claude hooks call the same CLI entrypoint with `claude` as the agent name:

```text
seiton hook claude session-start
seiton hook claude user-prompt-submit
seiton hook claude notification
seiton hook claude stop
seiton hook claude stop-failure
seiton hook claude post-tool-use
seiton hook claude session-end
```

Add matching commands to `~/.claude/settings.json` or a project-local `.claude/settings.json`.

## Manual Notifications

Use `seiton notify` inside a tmux pane when you need to raise a waiting state manually:

```bash
seiton notify "implementation finished"
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

- If `but status -fv` reports `Setup required: No GitButler project found`, Seiton runs `but setup` and retries.
- If a terminal tab is missing during focus, Seiton creates one.
- If a tmux session is missing during focus, Seiton creates one.
- If a target pane lives in another tmux window, Seiton switches to that window before selecting the pane.
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
