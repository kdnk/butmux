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
butmux       /repo/butmux
butmux       workspace  butmux               ready            -
butmux       context    feature/ui           waiting
             pane       codex %1             running          running tests
dot          /repo/dot
dot          workspace  dot                  missing tmux     -
dot          context    fix/path             running
             pane       claude %2            running          editing files

b branch  B dependent  enter focus  s sync  c workspace  n rename  x remove  ? help  q quit
```

The table uses fixed columns:

- `Project`: registry project name
- `Type`: `workspace`, `context`, or `pane`
- `Name`: workspace session name, branch name, or agent plus pane id
- `Status`: compact status text
- `Agents`: `-` when a workspace/context has no panes, blank when its panes are
  listed underneath, or the pane's latest line on pane rows

The selected row is visually stronger than the current `>` marker. In Ink this
should use a reversed or highlighted row marker plus color, while staying
readable in terminals that do not render background colors consistently.

Project boundaries are shown as non-selectable section headings inside the
Workspaces frame. Selectable workspace/context/agent rows are indented under
their project heading. The table remains actionable at the workspace/context
row level, and each agent pane is also a selectable row so users can focus a
pane directly. tmux and terminal names are not shown as persistent detail rows;
missing tmux or terminal state is surfaced through the row status.

## Row Model

Replace the selected-project context rows with all-project rows:

```ts
type WorkbenchRow =
  | ({
      type: "workspace";
      project: ProjectContexts;
      projectRoot: string;
      projectName: string;
      name: string;
      status: WorkspaceSession["status"];
      agentPanes: AgentPane[];
      workspace?: WorkspaceSession;
    } | {
      type: "context";
      project: ProjectContexts;
      projectRoot: string;
      projectName: string;
      name: string;
      status: Context["status"];
      agentPanes: AgentPane[];
      context: Context;
    })
  | {
      type: "pane";
      project: ProjectContexts;
      projectRoot: string;
      projectName: string;
      name: string;
      status: AgentPane["status"];
      agentPanes: [];
      pane: AgentPane;
      parent: Exclude<WorkbenchRow, { type: "pane" }>;
    };
```

For each project, rows are built in this order:

1. workspace row, using the real workspace session when present
2. workspace agent pane rows, if any
3. managed context rows in existing context order
4. each context's agent pane rows, if any

If a project has no workspace session, the workspace row still appears with
`missing_tmux`, so users can create or focus the workspace without switching
views.

## Keyboard Behavior

Remove pane navigation from the main workflow:

- `j/k` or Up/Down moves the single selected row
- `Enter` focuses the selected workspace, branch context, or agent pane
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

## Visible Rows And Status

The workspaces table shows only scan-critical rows inline:

- workspace rows
- branch context rows
- selectable agent pane rows with agent, pane id, status, and last line
- project warnings

tmux session names and terminal tab titles are not displayed by default. Missing
tmux or terminal state remains visible in the compact `Status` column.

The header shows the busy state, errors, warnings, and last action messages
inline with the top-level command hints. There is no separate activity frame;
the workspaces table remains the dominant surface.

The key hints render as an unframed footer below the workspaces table. Hints are
laid out horizontally and wrap onto additional lines when the terminal is too
narrow.

## Error Handling

Existing service errors surface in the header status text.

Disabled commands do nothing and may set a short status message only when the
no-op would otherwise be confusing, such as pressing `B` on a workspace row.
Branch prompt validation remains unchanged.

## Testing

Add or update focused tests:

- row builder creates one flat row list across multiple projects
- selected branch anchors are only available for managed context rows
- branch prompts use the selected row's project
- key hints omit pane navigation and include only actions valid for the row
- layout rendering includes table headers, project headers, rows from multiple
  projects, selectable pane rows, header status, and the unframed key footer
- state helpers no longer expose pane switching as the main navigation model

Avoid brittle full-terminal snapshots. Assert stable labels, commands, and row
content.

## Documentation

Update README keyboard documentation to describe the single-list workflow and
remove pane movement shortcuts.
