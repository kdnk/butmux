# Single-List TUI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pane-based TUI with one unified table that always shows every registered project's workspace and managed branch contexts.

**Architecture:** Move row construction from "selected project -> context rows" to "all projects -> workbench rows" in `src/tui/rows.ts`. Simplify navigation state to one selected row, then update `TuiApp` and layout helpers to render the table, selected detail, and command prompts against that row. Keep core service APIs unchanged.

**Tech Stack:** TypeScript, React, Ink, Vitest, GitButler CLI (`but`) for version-control writes.

## Global Constraints

- Use GitButler (`but`) for version-control write operations in this repository.
- Do not use direct `git` write operations such as `git add`, `git commit`, `git checkout`, `git merge`, `git rebase`, or `git push` unless the user explicitly changes this policy.
- Read-only `git` inspection commands are allowed when they are useful.
- Do not access GitHub URLs directly; use the `gh` CLI for GitHub operations.
- Do not change core GitButler, tmux, terminal backend, registry, branch creation, managed session naming, or plugin hook behavior.
- Remove pane navigation from the main workflow: no `h/l`, Left/Right, Tab, or Shift+Tab hints.
- Keep rendering tests focused on stable labels and commands instead of brittle full-terminal snapshots.

---

## File Structure

- Modify `src/tui/rows.ts`: replace selected-project `ContextRow` helpers with flat `WorkbenchRow` helpers while preserving branch prompt and detail helpers.
- Modify `src/tui/state.ts`: keep bounded selection helpers and remove pane-centric state from tests.
- Modify `src/tui/keymap.ts`: replace pane-aware hints with row-aware hints and help rows.
- Modify `src/tui/layout.tsx`: add reusable table/detail surfaces for the single-list workbench.
- Modify `src/tui/App.tsx`: store one selected row index and dispatch commands using the selected row.
- Modify `tests/tui-rows.test.ts`: cover flat rows, branch prompts, agent summaries, and context reorder intents.
- Modify `tests/tui-state.test.ts`: cover only single-list selection and row-aware key hints.
- Modify `tests/tui-layout.test.tsx`: cover table/detail rendering for multiple projects.
- Modify `README.md`: document the single-list keyboard workflow.

---

### Task 1: Flat Workbench Rows

**Files:**
- Modify: `src/tui/rows.ts`
- Modify: `tests/tui-rows.test.ts`

**Interfaces:**
- Produces:
  - `type WorkbenchRow`
  - `buildWorkbenchRows(projects: ProjectContexts[]): WorkbenchRow[]`
  - `selectedBranchAnchor(row: WorkbenchRow | undefined): { anchor: string; label: string } | undefined`
  - `createBranchPrompt(input: "b" | "B", row: WorkbenchRow | undefined): BranchPromptState | undefined`
  - `statusColor(row: WorkbenchRow): "green" | "yellow" | "red" | "white"`
  - `detailTitle(row: WorkbenchRow): string`
  - `readAgentPanes(row: WorkbenchRow | undefined): AgentPane[]`
  - `agentSummary(row: WorkbenchRow): string`
  - `toContextReorderIntent(rows: WorkbenchRow[], selectedIndex: number, delta: -1 | 1): { projectRoot: string; from: number; to: number; nextRowIndex: number } | undefined`
- Consumes existing `ProjectContexts`, `WorkspaceSession`, `Context`, and `AgentPane` model types.

- [ ] **Step 1: Write failing row tests**

Replace `tests/tui-rows.test.ts` with tests that exercise two projects:

```ts
it("builds a flat workbench row list across projects", () => {
  const rows = buildWorkbenchRows([projectA, projectB]);

  expect(rows.map((row) => [row.projectName, row.type, row.name, row.status])).toEqual([
    ["a", "workspace", "a", "missing_tmux"],
    ["a", "context", "feature/base", "ready"],
    ["b", "workspace", "b-workspace", "ready"],
    ["b", "context", "fix/path", "missing_terminal"]
  ]);
});

it("summarizes agent activity for rows", () => {
  const rows = buildWorkbenchRows([projectA, projectB]);

  expect(agentSummary(rows[0]!)).toBe("-");
  expect(agentSummary(rows[3]!)).toBe("claude running");
});

it("creates branch prompts from the selected row project", () => {
  const rows = buildWorkbenchRows([projectA, projectB]);

  expect(createBranchPrompt("b", rows[3]!)).toMatchObject({
    type: "create-branch",
    projectRoot: "/repo/b",
    mode: "independent"
  });
  expect(createBranchPrompt("B", rows[3]!)).toMatchObject({
    type: "create-branch",
    projectRoot: "/repo/b",
    mode: "dependent",
    anchor: "fix/path-id",
    anchorLabel: "fix/path"
  });
  expect(createBranchPrompt("B", rows[2]!)).toBeUndefined();
});

it("computes context reorder intent within the selected row project", () => {
  const rows = buildWorkbenchRows([projectAWithTwoContexts]);

  expect(toContextReorderIntent(rows, 2, -1)).toEqual({
    projectRoot: "/repo/a",
    from: 1,
    to: 0,
    nextRowIndex: 1
  });
});
```

- [ ] **Step 2: Run row tests and verify they fail**

Run: `npm test -- tests/tui-rows.test.ts`

Expected: FAIL because `buildWorkbenchRows`, `agentSummary`, and `toContextReorderIntent` do not exist and `createBranchPrompt` still expects a project plus context row.

- [ ] **Step 3: Implement flat row helpers**

In `src/tui/rows.ts`, define `WorkbenchRow` with shared row fields:

```ts
type WorkbenchRowBase = {
  project: ProjectContexts;
  projectRoot: string;
  projectName: string;
  name: string;
  status: Context["status"] | WorkspaceSession["status"];
  agentPanes: AgentPane[];
};

export type WorkbenchRow =
  | (WorkbenchRowBase & { type: "workspace"; workspace?: WorkspaceSession })
  | (WorkbenchRowBase & { type: "context"; context: Context });
```

Implement `buildWorkbenchRows` by pushing one workspace row per project and then all managed context rows:

```ts
export function buildWorkbenchRows(projects: ProjectContexts[]): WorkbenchRow[] {
  return projects.flatMap((project) => {
    const workspace = project.workspaceSession;
    const workspaceRow: WorkbenchRow = {
      type: "workspace",
      project,
      projectRoot: project.project.root,
      projectName: project.project.name,
      name: workspace?.name ?? project.project.name,
      status: workspace?.status ?? "missing_tmux",
      agentPanes: workspace?.agentPanes ?? [],
      ...(workspace ? { workspace } : {})
    };
    return [
      workspaceRow,
      ...project.contexts.map((context): WorkbenchRow => ({
        type: "context",
        project,
        projectRoot: project.project.root,
        projectName: project.project.name,
        name: context.branch,
        status: context.status,
        agentPanes: context.agentPanes,
        context
      }))
    ];
  });
}
```

Update branch, detail, status, agent, and reorder helpers to accept `WorkbenchRow`.

- [ ] **Step 4: Run row tests and verify they pass**

Run: `npm test -- tests/tui-rows.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Run `but diff`, then commit only the row helper and row test changes:

```bash
but commit single-list-tui -c -m "feat: add flat tui workbench rows" --changes <ids>
```

Use a commit description with Why and What.

---

### Task 2: Single-List State And Key Hints

**Files:**
- Modify: `src/tui/state.ts`
- Modify: `src/tui/keymap.ts`
- Modify: `tests/tui-state.test.ts`

**Interfaces:**
- Produces:
  - `moveSelection(current: number, delta: number, itemCount: number): number`
  - `clampSelection(current: number, itemCount: number): number`
  - `type KeyHintContext = { hasRow: boolean; hasWorkspaceRow: boolean; hasManagedContext: boolean; hasRemovableOrphan: boolean; canReorderContext: boolean }`
  - `keyHintsForContext(context: KeyHintContext): readonly KeyHint[]`
- Consumes `WorkbenchRow` state from Task 1 through booleans computed by `TuiApp`.

- [ ] **Step 1: Write failing state/keymap tests**

Replace pane-specific assertions in `tests/tui-state.test.ts` with:

```ts
it("keeps single-list selection within bounds", () => {
  expect(moveSelection(0, -1, 3)).toBe(0);
  expect(moveSelection(0, 1, 3)).toBe(1);
  expect(moveSelection(2, 1, 3)).toBe(2);
  expect(clampSelection(5, 2)).toBe(1);
  expect(clampSelection(1, 0)).toBe(0);
});

it("returns row-aware key hints without pane navigation", () => {
  const hints = keyHintsForContext({
    hasRow: true,
    hasWorkspaceRow: false,
    hasManagedContext: true,
    hasRemovableOrphan: false,
    canReorderContext: true
  });

  expect(hints).toEqual(expect.arrayContaining([
    ["enter", "focus"],
    ["b", "branch"],
    ["B", "dependent"],
    ["n", "rename"],
    ["[/]", "move"]
  ]));
  expect(hints).not.toContainEqual(["tab", "pane"]);
});
```

- [ ] **Step 2: Run state/keymap tests and verify they fail**

Run: `npm test -- tests/tui-state.test.ts`

Expected: FAIL because the current key hint context requires a pane and includes pane movement.

- [ ] **Step 3: Simplify state helpers and key hints**

Keep `moveSelection` and `clampSelection` in `src/tui/state.ts`. Remove `TuiPane`, `switchPane`, `cyclePane`, and `toReorderIntent` if no production code still imports them after Task 4.

In `src/tui/keymap.ts`, define row-aware hints:

```ts
export type KeyHintContext = {
  hasRow: boolean;
  hasWorkspaceRow: boolean;
  hasManagedContext: boolean;
  hasRemovableOrphan: boolean;
  canReorderContext: boolean;
};
```

Return common hints `j/k`, `r`, `a`, `,`, `?`, and `q`, plus row-dependent hints for focus, sync, workspace, branch, dependent branch, rename, move, and remove.

- [ ] **Step 4: Run state/keymap tests and verify they pass**

Run: `npm test -- tests/tui-state.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Run `but diff`, then commit only state/keymap/test changes:

```bash
but commit single-list-tui -m "feat: simplify tui navigation hints" --changes <ids>
```

Use a commit description with Why and What.

---

### Task 3: Single-List Layout And App Wiring

**Files:**
- Modify: `src/tui/layout.tsx`
- Modify: `src/tui/App.tsx`
- Modify: `tests/tui-layout.test.tsx`

**Interfaces:**
- Consumes `WorkbenchRow` helpers from Task 1 and key hint helpers from Task 2.
- Produces:
  - `WorkbenchTable({ rows, selectedIndex })`
  - `TuiApp` with one `rowIndex` selection state.

- [ ] **Step 1: Write failing layout tests**

Update `tests/tui-layout.test.tsx` to render a shell with `WorkbenchTable`:

```tsx
const rows = buildWorkbenchRows([projectA, projectB]);
const output = renderToString(
  <Shell
    header={<Text>butmux</Text>}
    activity={<ActivityStrip busy={undefined} error={undefined} lastSync="ready" warnings={[]} />}
    keyBar={<KeyBar rows={[["enter", "focus"], ["b", "branch"]]} />}
  >
    <WorkbenchTable rows={rows} selectedIndex={3} />
  </Shell>,
  { columns: 120 }
);

expect(output).toContain("Project");
expect(output).toContain("Type");
expect(output).toContain("a");
expect(output).toContain("b");
expect(output).toContain("/repo/a");
expect(output).toContain("/repo/b");
expect(output).toContain("fix/path");
expect(output).toContain("tmux: bm_fix/path");
expect(output).toContain("terminal: bm_fix/path");
expect(output).toContain("claude");
expect(output).not.toContain("Selected");
expect(output).not.toContain("Projects");
expect(output).not.toContain("Contexts");
```

- [ ] **Step 2: Run layout tests and verify they fail**

Run: `npm test -- tests/tui-layout.test.tsx`

Expected: FAIL because `WorkbenchTable` does not yet render expanded row details.

- [ ] **Step 3: Implement table and detail layout components**

Add `WorkbenchTable` to `src/tui/layout.tsx`. Use `padEnd` for stable columns,
project header rows for each project boundary, expanded tmux/terminal/agent
detail rows under every workspace/context, and `Text inverse` or a strong
marker for the selected row:

```tsx
export function WorkbenchTable({ rows, selectedIndex }: { rows: WorkbenchRow[]; selectedIndex: number }) {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">{formatTableRow("Project", "Type", "Name", "Status", "Agents")}</Text>
      {rows.length === 0 ? <Text dimColor>No projects</Text> : null}
      {rows.map((row, index) => (
        <Text key={rowKey(row)} color={index === selectedIndex ? "cyan" : statusColor(row)} inverse={index === selectedIndex}>
          {formatTableRow(row.projectName, row.type, row.name, statusLabel(row.status), agentSummary(row))}
        </Text>
      ))}
    </Box>
  );
}
```

Do not add a separate selected-detail component; all details stay inside the
workspaces table.

- [ ] **Step 4: Run layout tests and verify they pass**

Run: `npm test -- tests/tui-layout.test.tsx`

Expected: PASS.

- [ ] **Step 5: Refactor `TuiApp` to use one selected row**

In `src/tui/App.tsx`:

- replace `pane`, `projectIndex`, `contextIndex`, `contextRows`, and `selectedContextRow`
  with `rowIndex`, `rows`, and `selectedRow`
- handle `j/k` and arrows with `moveSelection(rowIndex, delta, rows.length)`
- remove `h/l`, Left/Right, Tab, and Shift+Tab input handling
- call `createBranchPrompt(input, selectedRow)`
- use `selectedRow.projectRoot` for `s`, `b`, `c`, and workspace removal
- use `selectedRow.context` for `B`, `n`, orphan removal, context reorder, and focus
- use only `WorkbenchTable` for the main workbench rows and remove the selected
  detail section from the render tree

- [ ] **Step 6: Run focused TUI tests**

Run: `npm test -- tests/tui-rows.test.ts tests/tui-state.test.ts tests/tui-layout.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

Run `but diff`, then commit app/layout/test changes:

```bash
but commit single-list-tui -m "feat: render single-list tui workbench" --changes <ids>
```

Use a commit description with Why and What.

---

### Task 4: Documentation And Full Verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes the final keyboard behavior from Tasks 1-3.
- Produces README keyboard documentation that matches the single-list workflow.

- [ ] **Step 1: Write failing README test**

Update `tests/readme-tui-docs.test.ts` so it expects no pane navigation and expects the single-list behavior:

```ts
expect(readme).toContain("j/k or Up/Down     move selection");
expect(readme).toContain("Enter              focus selected workspace or context");
expect(readme).not.toContain("h/l or Left/Right  switch pane");
expect(readme).not.toContain("Tab / Shift+Tab     cycle panes");
```

- [ ] **Step 2: Run README test and verify it fails**

Run: `npm test -- tests/readme-tui-docs.test.ts`

Expected: FAIL because README still documents pane navigation.

- [ ] **Step 3: Update README keyboard docs**

Update the README keyboard table to remove pane movement and describe selected-row actions:

```text
j/k or Up/Down     move selection
Enter              focus selected workspace or context
r                  refresh
s                  sync selected row's project
a                  add project path
b                  create independent branch in selected row's project
B                  create dependent branch from selected context
n                  rename selected managed context
x                  remove selected workspace project or orphan context after confirmation
c                  create selected row's project workspace session
[ / ]              reorder selected managed context
,                  cycle terminal backend
?                  show help
q or Ctrl+C        quit
```

- [ ] **Step 4: Run full verification**

Run:

```bash
npm test
npm run build
```

Expected: both commands exit 0 with no test failures or TypeScript/build errors.

- [ ] **Step 5: Commit Task 4**

Run `but diff`, then commit README and any final test updates:

```bash
but commit single-list-tui -m "docs: document single-list tui workflow" --changes <ids>
```

Use a commit description with Why and What.
