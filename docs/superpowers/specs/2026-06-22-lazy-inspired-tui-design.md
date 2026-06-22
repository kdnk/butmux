# Lazy-Inspired TUI Design

## Goal

Make butmux feel inspired by lazygit and lazydocker while staying focused on
GitButler-backed tmux work contexts.

After this change:

- the terminal UI uses a denser framed layout with a header, focused panes, an
  activity strip, and a context-sensitive key bar
- navigation feels closer to lazygit: pane movement, selection movement,
  detail focus, help, and command prompts are predictable and keyboard-first
- status presentation feels closer to lazydocker: agent panes, waiting states,
  warnings, and recent output are visible without opening a separate screen
- users can create GitButler branches from the TUI with distinct shortcuts for
  independent and dependent branch creation

## Why

butmux sits between GitButler branch management, tmux sessions, terminal tabs,
and coding-agent pane state. A sparse three-column list makes the data visible,
but it does not yet communicate "this is a workbench" the way lazygit and
lazydocker do.

The UI should preserve the existing direct keyboard workflow while adding a
stronger visual hierarchy, better status density, and a first-class branch
creation flow.

## Scope

This design changes:

- Ink TUI layout and visual treatment
- context-sensitive key hints
- prompt/modal presentation
- app service support for creating GitButler branches
- TUI behavior for independent and dependent branch creation
- tests for state helpers, service branch creation, and rendering behavior

This design does not change:

- managed tmux session naming
- terminal backend support, which remains `kitty` and `wezterm`
- existing `hook`, `notify`, and `open` CLI commands
- GitButler branch rename behavior
- plugin distribution for Codex or Claude Code

## Visual Model

The main screen is a single lazy-style workbench:

```text
┌ butmux ─ project/path ─ backend ─ refresh status ────────────────┐
│ Projects        │ Contexts / Branches          │ Detail / Agents │
│                 │                              │                 │
│ repo-a          │ workspace       ready         │ branch info     │
│ repo-b          │ feature/foo     running 1     │ tmux/session    │
│                 │ bug/bar         waiting 1     │ agent panes     │
├─────────────────┴──────────────────────────────┴─────────────────┤
│ Activity / warnings / last action                                  │
├────────────────────────────────────────────────────────────────────┤
│ q quit  ? help  tab/h/l pane  j/k move  enter focus  b branch ...  │
└────────────────────────────────────────────────────────────────────┘
```

Use lazygit-inspired framing:

- visible borders around panes
- active pane title in cyan or another strong accent
- selected row marker that is visually stronger than `>`
- fixed footer key bar
- help as a full-width overlay

Use lazydocker-inspired status density:

- compact badges for `ready`, `missing`, `running`, `waiting`, `error`, and
  agent counts
- detail pane shows agent pane rows with agent, pane id, status, and last line
- activity strip shows warnings, last sync result, last action, and errors

The implementation should stay within Ink primitives. Do not add a new TUI
framework unless Ink cannot render a required interaction.

## Navigation And Commands

Existing keys remain valid:

```text
j/k or Up/Down      move selection
h/l or Left/Right   switch pane
Enter               focus selected workspace, context, or pane
r                   refresh
s                   sync selected project
a                   add project path
n                   rename selected context
x                   remove project or orphan context
c                   create workspace session
[ / ]               reorder project or context
,                   cycle terminal backend
?                   toggle help
q or Ctrl+C         quit
```

Add lazy-style pane movement:

```text
Tab                 move to next pane
Shift+Tab           move to previous pane
```

The key bar is context-sensitive. It should show only actions that make sense
for the active pane and current selection.

Project pane examples:

```text
b new branch  a add project  s sync  c workspace  x remove
```

Context pane examples:

```text
enter focus  b new branch  B branch from selected  n rename  [/] move
```

Detail pane examples:

```text
enter focus pane  b new branch  r refresh  ? help
```

## GitButler Branch Creation

Branch creation is part of the TUI, not a separate CLI command.

Two shortcuts are required:

```text
b                   create an independent GitButler branch in the selected project
B                   create a dependent GitButler branch from the selected context branch
```

### Independent Branch

Lowercase `b` creates an independent parallel branch for the selected project,
regardless of which context row is selected.

Command:

```bash
but branch new <name>
```

Run it with `cwd` set to the selected project root.

### Dependent Branch

Uppercase `B` creates a stacked/dependent branch anchored to the selected
managed context branch.

Command:

```bash
but branch new <name> -a <anchor>
```

Use the selected context's `branchId` when available. Fall back to the selected
context's branch name. `B` is disabled when the selected row is a workspace row,
workspace-missing row, or there is no selected managed context.

## Branch Creation Prompt

Both `b` and `B` open a bottom modal prompt. The main panes remain visible.

Independent branch prompt:

```text
┌ New GitButler branch ───────────────────────────────┐
│ Project  /repo/butmux                                │
│ Type     independent                                 │
│ Name     feature/new-work█                           │
│ Enter create   Esc cancel                            │
└──────────────────────────────────────────────────────┘
```

Dependent branch prompt:

```text
┌ New dependent GitButler branch ──────────────────────┐
│ Project  /repo/butmux                                │
│ Anchor   feature/base                                │
│ Name     feature/follow-up█                          │
│ Enter create   Esc cancel                            │
└──────────────────────────────────────────────────────┘
```

Prompt validation:

- empty names are ignored or reported as `Branch name cannot be empty`
- duplicate branch names report `Branch already exists: <name>`
- GitButler failures surface in the activity strip
- Esc closes the prompt without changing state

After a successful branch creation:

1. refresh or sync the selected project
2. reconcile the registry
3. create missing tmux session and terminal tab through the existing sync plan
4. select the new context row
5. focus the new context when that can be done without surprising pane changes
6. show an activity message such as `created feature/foo - synced 2 commands`

If focusing is too disruptive in practice, the implementation may select the
new row and leave focus explicit via Enter. The first implementation should make
that choice explicit in tests and README copy.

## App Service API

Add branch creation to the app service:

```ts
export type CreateBranchInput = {
  projectRoot: string;
  name: string;
  anchor?: string;
};

createBranch(input: CreateBranchInput): Promise<AppState & {
  commands: SyncCommand[];
  branchName: string;
}>;
```

Dependencies should include a small wrapper around GitButler branch creation:

```ts
createGitButlerBranch(input: {
  projectRoot: string;
  name: string;
  anchor?: string;
}): Promise<void>;
```

Implementation behavior:

- trim the branch name
- reject empty branch names before calling GitButler
- read the current project snapshot to detect duplicate branch names
- call `but branch new <name>` for independent branches
- call `but branch new <name> -a <anchor>` for dependent branches
- reuse `syncProjectRoot` after creation so registry, tmux, and terminal tabs
  are updated through the same path as normal sync

## Rendering Components

The current `TuiApp` is already doing rendering, state, prompts, and command
dispatch in one file. This redesign should split small presentation helpers
without over-abstracting:

```text
src/tui/App.tsx
src/tui/layout.tsx
src/tui/rows.ts
src/tui/state.ts
src/tui/keymap.ts
```

Recommended responsibilities:

- `App.tsx`: stateful orchestration and service calls
- `layout.tsx`: frame, header, panes, activity strip, key bar, prompt modal
- `rows.ts`: build display rows and badge labels from app state
- `state.ts`: pane switching, selection movement, reorder intent, key bar model
- `keymap.ts`: help rows and context-sensitive key descriptions

Avoid a broad rewrite. Move code only when it directly supports the new
layout or branch creation behavior.

## Testing

Add focused tests for:

- `Tab` and `Shift+Tab` pane movement helpers
- context-sensitive key bar rows for projects, contexts, and detail panes
- branch creation prompt state transitions
- `createBranch` calling `but branch new <name>` for independent branches
- `createBranch` calling `but branch new <name> -a <anchor>` for dependent
  branches
- duplicate and empty branch errors
- successful branch creation reusing sync behavior and returning sync commands
- README keyboard documentation for `b` and `B`

Rendering tests should not snapshot the whole terminal. Assert stable text,
labels, and key hints so the layout can evolve without brittle fixture churn.

## Rollout

Implement in this order:

1. app service branch creation with tests
2. TUI state/keymap changes for `b`, `B`, Tab, and Shift+Tab
3. prompt modal and activity strip behavior
4. visual shell layout
5. README updates

This order keeps core behavior testable before the visual refresh.
