# Plugin Hook Distribution Design

## Goal

Distribute butmux agent hooks through Codex and Claude Code plugins instead of
editing each user's personal hook configuration files directly.

After this change:

- Codex users can install a butmux Codex plugin that provides Codex lifecycle hooks
- Claude Code users can install a butmux Claude plugin that provides Claude lifecycle hooks
- hook commands continue to call the existing `butmux hook <agent> <event>` CLI entrypoint
- user-level `~/.codex` and `~/.claude` settings remain owned by Codex and Claude plugin install flows
- README documents plugin installation as the primary setup path

## Why

Each user has their own Codex and Claude Code settings. A butmux CLI command
that edits those files would need to merge, de-duplicate, back up, and roll back
settings across two independent products. That makes butmux responsible for
configuration ownership that already belongs to the agent runtimes.

Plugins are a better boundary. Codex and Claude Code both support installable
plugins with bundled lifecycle hooks. Installing, enabling, disabling, reviewing,
and trusting those hooks should happen in the agent's native plugin and hook UI.
butmux should provide a stable hook target and packaged hook definitions.

## Scope

This design changes:

- repository layout for Codex and Claude plugin artifacts
- marketplace metadata for discovering those plugins from this repository
- hook configuration files for Codex and Claude lifecycle events
- documentation for installing, verifying, and troubleshooting the plugins
- tests that validate generated plugin files and hook command coverage

This design does not change:

- tmux pane option names
- hook payload parsing in `src/core/commands.ts`
- Codex and Claude event-to-status behavior
- terminal backend behavior
- per-user Codex or Claude settings files through a butmux installer command

## Recommended Approach

Use separate plugin directories for each agent runtime:

```text
.agents/plugins/marketplace.json
.claude-plugin/marketplace.json
plugins/
  codex-butmux/
    .codex-plugin/plugin.json
    hooks/hooks.json
  claude-butmux/
    .claude-plugin/plugin.json
    hooks/hooks.json
```

The two plugins duplicate small hook definition files instead of trying to share
files outside their plugin roots. Installed plugins are copied into runtime
caches, so cross-plugin or parent-directory references are fragile.

## Codex Plugin

The Codex plugin lives at `plugins/codex-butmux`.

The manifest at `.codex-plugin/plugin.json` declares metadata only. The first
implementation should not declare a `hooks` manifest field; Codex can discover
the default plugin hook file at `hooks/hooks.json`.

The Codex hook file covers these events:

- `SessionStart` -> `butmux hook codex session-start`
- `UserPromptSubmit` -> `butmux hook codex user-prompt-submit`
- `Stop` -> `butmux hook codex stop`

Codex hooks are enabled by default in current Codex, but users and admins can
turn hooks off. The plugin must respect that runtime setting.

## Claude Plugin

The Claude Code plugin lives at `plugins/claude-butmux`.

The manifest at `.claude-plugin/plugin.json` declares metadata. Claude Code can
discover hooks from `hooks/hooks.json`.

The Claude hook file covers these events:

- `SessionStart` -> `butmux hook claude session-start`
- `UserPromptSubmit` -> `butmux hook claude user-prompt-submit`
- `Notification` -> `butmux hook claude notification`
- `Stop` -> `butmux hook claude stop`
- `StopFailure` -> `butmux hook claude stop-failure`
- `PostToolUse` -> `butmux hook claude post-tool-use`
- `SessionEnd` -> `butmux hook claude session-end`

`PostToolUse` keeps the broad matcher used by Claude hooks unless a narrower
matcher becomes necessary for performance.

## Hook Command Strategy

Plugin hook commands must not reference `../dist/cli.js` or other files outside
their plugin root. Marketplace-installed plugins are copied into cache
directories, so parent-relative paths will break.

The first implementation should call `butmux` from `PATH` and allow an explicit
`BUTMUX_BIN` override for users who keep butmux outside `PATH`.

Use a best-effort shell wrapper in the hook command:

```sh
sh -lc 'if [ -z "${TMUX_PANE:-}" ]; then exit 0; fi; bin="${BUTMUX_BIN:-butmux}"; if command -v "$bin" >/dev/null 2>&1 || [ -x "$bin" ]; then exec "$bin" hook codex session-start; fi'
```

Each event substitutes the agent and event arguments. If `butmux` is not
installed, or if the agent is not running inside tmux, the hook exits
successfully without changing pane state. That avoids breaking Codex or Claude
sessions because an optional status integration is unavailable.

## Marketplace Metadata

Codex marketplace metadata lives at:

```text
.agents/plugins/marketplace.json
```

It exposes `codex-butmux` with a local source path:

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

Claude marketplace metadata lives at:

```text
.claude-plugin/marketplace.json
```

It exposes `claude-butmux` with a local source path:

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

## User Experience

Users install the CLI first:

```bash
npm install -g butmux
```

Local development can continue to use:

```bash
npm link
```

Codex users add this repository's Codex marketplace and install `codex-butmux`.
Claude Code users add this repository's Claude marketplace and install
`claude-butmux`.

The README should include verification steps:

- run `command -v butmux`
- open Codex `/hooks` or Claude `/hooks` to review hook definitions
- start or resume an agent session inside tmux
- confirm butmux displays the pane as `codex` or `claude`

## Testing

Add focused tests for repository plugin artifacts:

- Codex marketplace JSON includes `codex-butmux` and required policy fields
- Claude marketplace JSON includes `claude-butmux` and required owner fields
- each plugin manifest has a matching plugin name and strict semver version
- Codex hooks cover the supported Codex events exactly once
- Claude hooks cover the supported Claude events exactly once
- hook command strings include the best-effort `BUTMUX_BIN` / `butmux` launcher
- hook command strings no-op when `TMUX_PANE` is missing
- no plugin hook command references parent-relative paths or `dist/cli.js`

The existing CLI and core tests should continue to cover the behavior behind
`butmux hook`.

## Error Handling

Hook commands are best-effort. Missing `butmux` or missing `TMUX_PANE` should
exit 0. Runtime errors from an installed `butmux` inside tmux should be allowed
to surface because they indicate a real integration problem such as an
unsupported event.

The README troubleshooting section should distinguish:

- plugin not installed or not enabled
- hook waiting for trust review
- hooks disabled by user or admin policy
- `butmux` not available on `PATH`
- session not running inside tmux, where plugin hooks intentionally no-op

## Release Notes

The package version should be bumped only when implementation lands. This design
document alone does not require a package version change.

## References

- Codex manual: plugin marketplaces and plugin-bundled hooks
- Codex manual: hook discovery, hook trust review, and hook runtime behavior
- Claude Code docs: plugin configuration and marketplace metadata
- Claude Code docs: plugin hooks and `hooks/hooks.json`
- Claude Code docs: plugin caching and path resolution
