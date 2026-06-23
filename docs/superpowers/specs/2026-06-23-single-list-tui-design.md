# Single-List TUI Design

## Goal

Make the butmux terminal UI useful as an always-visible workbench instead of a
project picker with separate panes.

After this change:

- the main screen shows every registered project's workspace and managed branch
  contexts in one unified table
- users do not need to select a project before seeing its contexts
- commands operate on the selected row's project or context
- the visual treatment feels denser and more polished than the current framed
  pane layout

## Why

The current TUI requires selecting a project before its contexts become visible.
That hides most of the user's active work, which is a poor fit for butmux's job:
monitoring and focusing many GitButler/tmux/agent work contexts.

The current visual model also spends space on pane boundaries and sparse labels
instead of the information users need to scan: project, row type, name, status,
and agent activity.

## Scope

This design changes:

- TUI row modeling for all projects
- main screen layout
- keyboard behavior that currently depends on active panes
- context-sensitive key hints and help text
- rendering tests for the new table and detail surfaces
- README keyboard documentation

This design does not change:

- core GitButler, tmux, or terminal backend behavior
- managed tmux session naming
- registry persistence shape
- branch creation service behavior
- plugin hook behavior

## Visual Model

The main screen becomes a single workbench:

```text
butmux  backend kitty  ready

Project      Type       Name                 Status           Agents
butmux       workspace  butmux               ready            -
butmux       branch     feature/ui           waiting          codex
dot          workspace  dot                  missing tmux     -
dot          branch     fix/path             running          claude

Selected
feature/ui  bm_butmux_feature%2Fui  waiting
codex %1 running running tests

b branch  B dependent  enter focus  s sync  c workspace  n rename  x remove  ? help  q quit
```

The table uses fixed columns:

- `Project`: registry project name
- `Type`: `workspace` or `branch`
- `Name`: workspace session name or branch name
- `Status`: compact status text
- `Agents`: compact agent summary, such as `codex waiting`, `claude running`,
  or `2 agents`

The selected row is visually stronger than the current `>` marker. In Ink this
should use a reversed or highlighted row marker plus color, while staying
readable in terminals that do not render background colors consistently.

Project boundaries may be shown with a subtle blank line or dim divider only
when it improves scanning. The table remains conceptually flat: every actionable
workspace or branch context is one selectable row.

## Row Model

Replace the selected-project context rows with all-project rows:

```ts
type WorkbenchRow =
  | {
      type: "workspace";
      project: ProjectContexts;
      label: string;
      workspace?: WorkspaceSession;
      projectRoot: string;
    }
  | {
      type: "context";
      project: ProjectContexts;
      label: string;
      context: Context;
      projectRoot: string;
    };
```

For each project, rows are built in this order:

1. workspace row, using the real workspace session when present
2. managed context rows in existing context order

If a project has no workspace session, the workspace row still appears with
`missing_tmux`, so users can create or focus the workspace without switching
views.

## Keyboard Behavior

Remove pane navigation from the main workflow:

- `j/k` or Up/Down moves the single selected row
- `Enter` focuses the selected workspace or branch context
- `r` refreshes all projects
- `s` syncs the selected row's project
- `a` adds a project path
- `b` creates an independent branch in the selected row's project
- `B` creates a dependent branch only when the selected row is a managed context
- `n` renames only when the selected row is a managed context
- `x` removes the selected project when the selected row is its workspace row,
  or removes an orphan when the selected row is an orphan managed context
- `c` creates the selected row's project workspace session
- `[` and `]` reorder managed contexts only when the selected row is a managed
  context; project reordering is removed from the single-list first pass unless
  the UI later introduces an explicit project row
- `,` cycles the terminal backend
- `?` toggles help
- `q` or Ctrl+C exits

`h/l`, Left/Right, Tab, and Shift+Tab are removed from key hints and help
because there are no panes to move between.

## Detail And Activity

The lower detail area shows only the selected row:

- workspace or branch title
- tmux session or missing-session state
- terminal tab title or missing-tab state
- project warnings
- agent pane rows with agent, pane id, status, and last line

The activity strip remains the place for busy state, errors, warnings, and
last action messages. It should be visually quieter than the selected row so it
does not compete with the main table.

## Error Handling

Existing service errors still surface in the activity strip.

Disabled commands do nothing and may set a short activity message only when the
no-op would otherwise be confusing, such as pressing `B` on a workspace row.
Branch prompt validation remains unchanged.

## Testing

Add or update focused tests:

- row builder creates one flat row list across multiple projects
- selected branch anchors are only available for managed context rows
- branch prompts use the selected row's project
- key hints omit pane navigation and include only actions valid for the row
- layout rendering includes table headers, rows from multiple projects, selected
  detail, activity strip, and key bar
- state helpers no longer expose pane switching as the main navigation model

Avoid brittle full-terminal snapshots. Assert stable labels, commands, and row
content.

## Documentation

Update README keyboard documentation to describe the single-list workflow and
remove pane movement shortcuts.
