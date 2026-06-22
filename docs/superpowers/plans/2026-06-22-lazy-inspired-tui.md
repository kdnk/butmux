# Lazy-Inspired TUI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the butmux TUI toward a lazygit/lazydocker-inspired workbench and add GitButler branch creation with `b` and `B`.

**Architecture:** Add core branch creation first through `AppService.createBranch`, then layer TUI state/keymap support, prompt handling, and the visual shell on top. Keep existing core sync behavior as the path that turns new GitButler branches into registry contexts, tmux sessions, and terminal tabs.

**Tech Stack:** TypeScript, Ink, React, Vitest, GitButler CLI (`but`), tmux, Kitty/WezTerm backend abstractions.

## Global Constraints

- Use GitButler (`but`) for version-control write operations in this repository.
- Do not use direct `git` write operations such as `git add`, `git commit`, `git checkout`, `git merge`, `git rebase`, or `git push` unless the user explicitly changes this policy.
- Read-only `git` inspection commands are allowed when they are useful.
- Do not access GitHub URLs directly; use the `gh` CLI for GitHub operations.
- Existing keys remain valid: `j/k`, arrows, `h/l`, Enter, `r`, `s`, `a`, `n`, `x`, `c`, `[`, `]`, `,`, `?`, `q`, Ctrl+C.
- Add `Tab` for next pane and `Shift+Tab` for previous pane.
- Add `b` for independent branch creation: `but branch new <name>`.
- Add `B` for dependent branch creation from selected managed context: `but branch new <name> -a <anchor>`.
- Use selected context `branchId` as dependent branch anchor when available; fall back to branch name.
- `B` is disabled for workspace rows, missing workspace rows, and empty selections.
- Do not change managed tmux session naming.
- Do not add a new TUI framework; use Ink primitives.
- Rendering tests should assert stable text, labels, and key hints instead of full terminal snapshots.

---

## File Structure

- Modify `src/core/commands.ts`: add `createGitButlerBranch`.
- Modify `src/core/app-service.ts`: add `CreateBranchInput`, dependency injection, and `createBranch`.
- Modify `src/tui/state.ts`: add pane cycling and key bar helper types.
- Modify `src/tui/keymap.ts`: add context-sensitive key bar definitions and branch shortcuts to help.
- Modify `src/tui/App.tsx`: add branch creation prompt state, `b`/`B` input handling, activity messages, and lazy-style layout usage.
- Create `src/tui/rows.ts`: move context row building and display labels out of `App.tsx`.
- Create `src/tui/layout.tsx`: framed header, panes, activity strip, key bar, help, and prompt modal presentation components.
- Modify `tests/app-service.test.ts`: cover independent/dependent branch creation and errors.
- Modify `tests/tui-state.test.ts`: cover `Tab`/`Shift+Tab` and key bar behavior.
- Create `tests/tui-rows.test.ts`: cover row labels and badges.
- Modify `tests/cli.test.ts` only if CLI usage text changes; otherwise leave it alone.
- Modify `README.md`: document lazy-style keys and branch creation.

---

### Task 1: Add Core GitButler Branch Creation

**Files:**
- Modify: `src/core/commands.ts`
- Modify: `src/core/app-service.ts`
- Modify: `tests/app-service.test.ts`

**Interfaces:**
- Produces:
  - `createGitButlerBranch(input: { projectRoot: string; name: string; anchor?: string }, cwd?: string, run?: ExecFunction): Promise<void>`
  - `CreateBranchInput = { projectRoot: string; name: string; anchor?: string }`
  - `AppService.createBranch(input: CreateBranchInput): Promise<AppState & { commands: SyncCommand[]; branchName: string }>`
- Consumes existing `syncProjectRoot`, `readSystemSnapshotForCwd`, `planSync`, and registry reconciliation behavior.

- [ ] **Step 1: Add failing app service tests for independent branch creation**

Append inside `describe("createAppService", () => { ... })` in `tests/app-service.test.ts`:

```ts
  it("creates an independent GitButler branch and syncs the project", async () => {
    const createGitButlerBranch = vi.fn(async () => undefined);
    const { service, readFullSystemSnapshot, readSystemSnapshotForCwd, applySyncCommand } = await createTempService({
      createGitButlerBranch
    });
    await service.addProjectRoot("/repo/a");
    readSystemSnapshotForCwd.mockResolvedValueOnce(emptySystemSnapshot());
    readSystemSnapshotForCwd.mockResolvedValueOnce(emptySystemSnapshot({
      branches: [{ name: "feature/new-work" }]
    }));
    readFullSystemSnapshot.mockImplementation(async (roots: string[]) => ({
      ...emptyFullSnapshot(roots),
      projects: Object.fromEntries(roots.map((root) => [
        root,
        { branches: root === "/repo/a" ? [{ name: "feature/new-work" }] : [], warnings: [] }
      ]))
    }));

    const state = await service.createBranch({
      projectRoot: "/repo/a",
      name: " feature/new-work "
    });

    expect(createGitButlerBranch).toHaveBeenCalledWith({
      projectRoot: "/repo/a",
      name: "feature/new-work"
    });
    expect(state.branchName).toBe("feature/new-work");
    expect(state.projectsWithContexts[0]?.contexts[0]).toMatchObject({
      branch: "feature/new-work",
      status: "missing_tmux"
    });
    expect(state.commands).toContainEqual({
      type: "create_tmux_session",
      branch: "feature/new-work",
      tmuxSession: "bm_a_feature%2Fnew-work"
    });
    expect(applySyncCommand).toHaveBeenCalled();
  });
```

Update `createTempService` in the same file to accept dependency overrides:

```ts
async function createTempService(overrides: Partial<Parameters<typeof createAppService>[0]> = {}) {
  tempDir = await mkdtemp(join(tmpdir(), "butmux-service-"));
  const configDir = join(tempDir, "config");
  const stateDir = join(tempDir, "state");
  const readFullSystemSnapshot = vi.fn(async (roots: string[]) => emptyFullSnapshot(roots));
  const readSystemSnapshotForCwd = vi.fn(async () => emptySystemSnapshot());
  const applySyncCommand = vi.fn(async () => undefined);
  const service = createAppService({
    configDir,
    stateDir,
    now: () => "2026-06-22T00:00:00.000Z",
    readFullSystemSnapshot,
    readSystemSnapshotForCwd,
    applySyncCommand,
    focusContext: vi.fn(async () => undefined),
    focusWorkspaceSession: vi.fn(async () => undefined),
    createWorkspaceSession: vi.fn(async () => undefined),
    renameManagedContext: vi.fn(async () => undefined),
    removeOrphanContext: vi.fn(async () => undefined),
    ...overrides
  });
  return { service, configDir, stateDir, readFullSystemSnapshot, readSystemSnapshotForCwd, applySyncCommand };
}
```

- [ ] **Step 2: Run the independent branch test and verify it fails**

Run: `npm test -- tests/app-service.test.ts -t "creates an independent GitButler branch"`

Expected: FAIL because `createGitButlerBranch` is not an accepted dependency and `service.createBranch` does not exist.

- [ ] **Step 3: Add failing tests for dependent branch and validation**

Append these tests inside `describe("createAppService", () => { ... })`:

```ts
  it("creates a dependent GitButler branch with an anchor", async () => {
    const createGitButlerBranch = vi.fn(async () => undefined);
    const { service, readFullSystemSnapshot, readSystemSnapshotForCwd } = await createTempService({
      createGitButlerBranch
    });
    await service.addProjectRoot("/repo/a");
    readSystemSnapshotForCwd.mockResolvedValueOnce(emptySystemSnapshot());
    readSystemSnapshotForCwd.mockResolvedValueOnce(emptySystemSnapshot({
      branches: [{ name: "feature/child" }]
    }));
    readFullSystemSnapshot.mockImplementation(async (roots: string[]) => ({
      ...emptyFullSnapshot(roots),
      projects: Object.fromEntries(roots.map((root) => [
        root,
        { branches: root === "/repo/a" ? [{ name: "feature/child" }] : [], warnings: [] }
      ]))
    }));

    const state = await service.createBranch({
      projectRoot: "/repo/a",
      name: "feature/child",
      anchor: "feature/base"
    });

    expect(createGitButlerBranch).toHaveBeenCalledWith({
      projectRoot: "/repo/a",
      name: "feature/child",
      anchor: "feature/base"
    });
    expect(state.branchName).toBe("feature/child");
  });

  it("rejects empty and duplicate branch names before creating a branch", async () => {
    const createGitButlerBranch = vi.fn(async () => undefined);
    const { service, readSystemSnapshotForCwd } = await createTempService({
      createGitButlerBranch
    });
    await service.addProjectRoot("/repo/a");

    await expect(service.createBranch({
      projectRoot: "/repo/a",
      name: " "
    })).rejects.toThrow("Branch name cannot be empty");
    expect(createGitButlerBranch).not.toHaveBeenCalled();

    readSystemSnapshotForCwd.mockResolvedValueOnce(emptySystemSnapshot({
      branches: [{ name: "feature/existing" }]
    }));
    await expect(service.createBranch({
      projectRoot: "/repo/a",
      name: "feature/existing"
    })).rejects.toThrow("Branch already exists: feature/existing");
    expect(createGitButlerBranch).not.toHaveBeenCalled();
  });
```

- [ ] **Step 4: Run the branch creation service tests and verify they fail**

Run: `npm test -- tests/app-service.test.ts -t "branch"`

Expected: FAIL for missing `createBranch` and dependency typing.

- [ ] **Step 5: Implement `createGitButlerBranch`**

In `src/core/commands.ts`, add near the workspace session helpers:

```ts
export type CreateGitButlerBranchInput = {
  projectRoot: string;
  name: string;
  anchor?: string;
};

export async function createGitButlerBranch(
  input: CreateGitButlerBranchInput,
  cwd = input.projectRoot,
  run: ExecFunction = exec
): Promise<void> {
  const args = ["branch", "new", input.name];
  if (input.anchor) {
    args.push("-a", input.anchor);
  }
  await run("but", args, cwd);
}
```

- [ ] **Step 6: Implement `AppService.createBranch`**

In `src/core/app-service.ts`:

1. Import the new command:

```ts
  createGitButlerBranch as createGitButlerBranchDefault,
  type CreateGitButlerBranchInput,
```

2. Add public types:

```ts
export type CreateBranchInput = {
  projectRoot: string;
  name: string;
  anchor?: string;
};
```

3. Extend `AppService`:

```ts
  createBranch(input: CreateBranchInput): Promise<AppState & { commands: SyncCommand[]; branchName: string }>;
```

4. Extend `AppServiceDeps`:

```ts
  createGitButlerBranch: (input: CreateGitButlerBranchInput) => Promise<void>;
```

5. Add default dependency:

```ts
    createGitButlerBranch: options.createGitButlerBranch ?? createGitButlerBranchDefault
```

6. Add method before `createWorkspaceSession`:

```ts
    async createBranch(input) {
      const branchName = input.name.trim();
      if (!branchName) {
        throw new Error("Branch name cannot be empty");
      }

      const backend = await readBackend();
      const snapshot = await deps.readSystemSnapshotForCwd(input.projectRoot, backend);
      if (snapshot.branches.some((branch) => branch.name === branchName)) {
        throw new Error(`Branch already exists: ${branchName}`);
      }

      await deps.createGitButlerBranch({
        projectRoot: input.projectRoot,
        name: branchName,
        ...(input.anchor ? { anchor: input.anchor } : {})
      });

      const result = await syncProjectRoot(input.projectRoot);
      const state = buildAppState(
        result.registry,
        await deps.readFullSystemSnapshot(orderedProjectRoots(result.registry), await readBackend()),
        { [input.projectRoot]: result.projectWarnings }
      );
      return { ...state, commands: result.commands, branchName };
    },
```

- [ ] **Step 7: Run service tests**

Run: `npm test -- tests/app-service.test.ts -t "branch"`

Expected: PASS for branch creation, duplicate branch rejection, existing branch-related tests, and ordered roots tests.

- [ ] **Step 8: Run broader core tests**

Run: `npm test -- tests/app-service.test.ts tests/core.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit Task 1**

Use `but status -fv` to get current change IDs, then commit the app-service and command changes:

```bash
but status -fv
but commit lazy-inspired-tui-design -m $'feat: create gitbutler branches from app service\n\nWhy:\n- The TUI needs a core operation for independent and dependent branch creation.\n- New branches should flow through existing sync behavior so tmux and terminal resources stay consistent.\n\nWhat:\n- add createGitButlerBranch around `but branch new`\n- add AppService.createBranch with empty and duplicate name validation\n- cover independent and dependent branch creation in app service tests' --changes <ids>
```

---

### Task 2: Add Lazy-Style TUI State And Key Hints

**Files:**
- Modify: `src/tui/state.ts`
- Modify: `src/tui/keymap.ts`
- Modify: `tests/tui-state.test.ts`

**Interfaces:**
- Consumes `TuiPane = "projects" | "contexts" | "detail"`.
- Produces:
  - `cyclePane(current: TuiPane, direction: -1 | 1): TuiPane`
  - `type KeyHintContext = { pane: TuiPane; hasProject: boolean; hasContext: boolean; hasManagedContext: boolean }`
  - `keyHintsForContext(context: KeyHintContext): readonly (readonly [string, string])[]`

- [ ] **Step 1: Add failing state and key hint tests**

Append to `tests/tui-state.test.ts`:

```ts
import { cyclePane } from "../src/tui/state";
import { keyHintsForContext } from "../src/tui/keymap";
```

Add tests:

```ts
  it("cycles panes with Tab-style movement", () => {
    expect(cyclePane("projects", 1)).toBe("contexts");
    expect(cyclePane("contexts", 1)).toBe("detail");
    expect(cyclePane("detail", 1)).toBe("projects");
    expect(cyclePane("projects", -1)).toBe("detail");
  });

  it("returns context-sensitive key hints", () => {
    expect(keyHintsForContext({
      pane: "projects",
      hasProject: true,
      hasContext: false,
      hasManagedContext: false
    })).toContainEqual(["b", "new branch"]);

    expect(keyHintsForContext({
      pane: "contexts",
      hasProject: true,
      hasContext: true,
      hasManagedContext: true
    })).toEqual(expect.arrayContaining([
      ["b", "new branch"],
      ["B", "branch from selected"],
      ["n", "rename"]
    ]));

    expect(keyHintsForContext({
      pane: "contexts",
      hasProject: true,
      hasContext: true,
      hasManagedContext: false
    })).not.toContainEqual(["B", "branch from selected"]);
  });
```

- [ ] **Step 2: Run state tests and verify they fail**

Run: `npm test -- tests/tui-state.test.ts`

Expected: FAIL because `cyclePane` and `keyHintsForContext` do not exist.

- [ ] **Step 3: Implement pane cycling**

In `src/tui/state.ts`, add:

```ts
export function cyclePane(current: TuiPane, direction: -1 | 1): TuiPane {
  const index = panes.indexOf(current);
  const nextIndex = (index + direction + panes.length) % panes.length;
  return panes[nextIndex] ?? current;
}
```

- [ ] **Step 4: Implement context-sensitive key hints**

In `src/tui/keymap.ts`, add:

```ts
import type { TuiPane } from "./state";

export type KeyHintContext = {
  pane: TuiPane;
  hasProject: boolean;
  hasContext: boolean;
  hasManagedContext: boolean;
};

export function keyHintsForContext(context: KeyHintContext): readonly (readonly [string, string])[] {
  const common = [
    ["tab", "pane"],
    ["j/k", "move"],
    ["r", "refresh"],
    ["?", "help"],
    ["q", "quit"]
  ] as const;

  if (context.pane === "projects") {
    return [
      ...(context.hasProject ? ([["b", "new branch"], ["s", "sync"], ["c", "workspace"], ["x", "remove"]] as const) : []),
      ["a", "add project"],
      ...common
    ];
  }

  if (context.pane === "contexts") {
    return [
      ...(context.hasContext ? ([["enter", "focus"], ["b", "new branch"]] as const) : []),
      ...(context.hasManagedContext ? ([["B", "branch from selected"], ["n", "rename"], ["[/]", "move"]] as const) : []),
      ...common
    ];
  }

  return [
    ...(context.hasContext ? ([["enter", "focus pane"], ["b", "new branch"]] as const) : []),
    ...common
  ];
}
```

Also add branch rows to `helpRows`:

```ts
  ["b", "create independent branch"],
  ["B", "create dependent branch from selected context"],
  ["tab / shift+tab", "cycle panes"],
```

- [ ] **Step 5: Run state tests**

Run: `npm test -- tests/tui-state.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

Use `but status -fv` to get change IDs:

```bash
but status -fv
but commit lazy-inspired-tui-design -m $'feat: add lazy-style tui key hints\n\nWhy:\n- The redesigned TUI needs pane cycling and context-sensitive action hints like lazygit.\n- Branch creation shortcuts should be discoverable without opening full help.\n\nWhat:\n- add Tab-style pane cycling helper\n- add context-sensitive key hint generation\n- document b and B in the help rows' --changes <ids>
```

---

### Task 3: Add Branch Creation Prompt Flow To TUI

**Files:**
- Modify: `src/tui/App.tsx`
- Create: `src/tui/rows.ts`
- Modify: `tests/tui-state.test.ts`

**Interfaces:**
- Consumes `AppService.createBranch(input)`.
- Consumes `keyHintsForContext`.
- Produces prompt state:
  - `{ type: "create-branch"; value: string; projectRoot: string; mode: "independent" }`
  - `{ type: "create-branch"; value: string; projectRoot: string; mode: "dependent"; anchor: string; anchorLabel: string }`

- [ ] **Step 1: Add row helper tests**

Create `tests/tui-rows.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildContextRows, selectedBranchAnchor } from "../src/tui/rows";
import type { ProjectContexts } from "../src/core/model";

const project: ProjectContexts = {
  project: { root: "/repo/a", name: "a", projectKey: "%2Frepo%2Fa", order: 10, enabled: true },
  contexts: [
    {
      id: "ctx-a",
      type: "managed",
      projectRoot: "/repo/a",
      branch: "feature/base",
      branchKey: "feature%2Fbase",
      branchId: "bu",
      tmuxSession: "bm_a_feature%2Fbase",
      terminalTabTitle: "bm_a_feature%2Fbase",
      agentPanes: [],
      order: 10,
      status: "ready"
    }
  ],
  warnings: []
};

describe("tui rows", () => {
  it("builds workspace and managed context rows", () => {
    const rows = buildContextRows(project);

    expect(rows[0]).toMatchObject({ type: "workspace-missing", label: "workspace session  missing" });
    expect(rows[1]).toMatchObject({ type: "context", label: "feature/base  ready" });
  });

  it("returns dependent branch anchors only for managed context rows", () => {
    const rows = buildContextRows(project);

    expect(selectedBranchAnchor(rows[0])).toBeUndefined();
    expect(selectedBranchAnchor(rows[1])).toEqual({
      anchor: "bu",
      label: "feature/base"
    });
  });
});
```

- [ ] **Step 2: Run row tests and verify they fail**

Run: `npm test -- tests/tui-rows.test.ts`

Expected: FAIL because `src/tui/rows.ts` does not exist.

- [ ] **Step 3: Extract row helpers**

Create `src/tui/rows.ts`:

```ts
import type { AgentPane, Context, ProjectContexts, WorkspaceSession } from "../core/model";

export type ContextRow =
  | { type: "workspace"; label: string; workspace: WorkspaceSession }
  | { type: "workspace-missing"; label: string; projectRoot: string }
  | { type: "context"; label: string; context: Context };

export function buildContextRows(project: ProjectContexts | undefined): ContextRow[] {
  if (!project) return [];
  const workspaceRow: ContextRow = project.workspaceSession
    ? {
        type: "workspace",
        label: `workspace session  ${project.workspaceSession.status}`,
        workspace: project.workspaceSession
      }
    : {
        type: "workspace-missing",
        label: "workspace session  missing",
        projectRoot: project.project.root
      };
  return [
    workspaceRow,
    ...project.contexts.map((context) => ({
      type: "context" as const,
      label: `${context.branch}  ${context.status}${context.agentPanes.length > 0 ? `  ${context.agentPanes.length} agent` : ""}`,
      context
    }))
  ];
}

export function selectedBranchAnchor(row: ContextRow | undefined): { anchor: string; label: string } | undefined {
  if (row?.type !== "context") return undefined;
  return {
    anchor: row.context.branchId ?? row.context.branch,
    label: row.context.branch
  };
}

export function readAgentPanes(row: ContextRow | undefined): AgentPane[] {
  if (!row) return [];
  if (row.type === "workspace") return row.workspace.agentPanes;
  if (row.type === "context") return row.context.agentPanes;
  return [];
}
```

Remove duplicate `ContextRow`, `buildContextRows`, and `readAgentPanes` definitions from `src/tui/App.tsx`, and import them from `./rows`.

- [ ] **Step 4: Run row tests**

Run: `npm test -- tests/tui-rows.test.ts`

Expected: PASS.

- [ ] **Step 5: Add branch creation prompt handling**

In `src/tui/App.tsx`:

1. Extend `PromptState`:

```ts
  | { type: "create-branch"; value: string; projectRoot: string; mode: "independent" }
  | { type: "create-branch"; value: string; projectRoot: string; mode: "dependent"; anchor: string; anchorLabel: string }
```

2. Add input handling before rename:

```ts
    if (input === "b") {
      if (selectedProject) {
        setPrompt({
          type: "create-branch",
          value: "",
          projectRoot: selectedProject.project.root,
          mode: "independent"
        });
      }
      return;
    }
    if (input === "B") {
      const branchAnchor = selectedBranchAnchor(selectedContextRow);
      if (selectedProject && branchAnchor) {
        setPrompt({
          type: "create-branch",
          value: "",
          projectRoot: selectedProject.project.root,
          mode: "dependent",
          anchor: branchAnchor.anchor,
          anchorLabel: branchAnchor.label
        });
      }
      return;
    }
```

3. Handle submit:

```ts
    if (current.type === "create-branch") {
      await runAction("creating branch", async () => {
        const next = await service.createBranch({
          projectRoot: current.projectRoot,
          name: current.value,
          ...(current.mode === "dependent" ? { anchor: current.anchor } : {})
        });
        setLastSync(`created ${next.branchName} · synced ${next.commands.length} commands`);
        return next;
      });
      return;
    }
```

4. Update `PromptView` for branch prompt:

```tsx
  if (prompt.type === "create-branch") {
    return (
      <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="yellow" paddingX={1}>
        <Text color="yellow">{prompt.mode === "dependent" ? "New dependent GitButler branch" : "New GitButler branch"}</Text>
        <Text>Project  {prompt.projectRoot}</Text>
        {prompt.mode === "dependent" ? <Text>Anchor   {prompt.anchorLabel}</Text> : <Text>Type     independent</Text>}
        <Text>Name     {prompt.value}</Text>
        <Text dimColor>Enter create   Esc cancel</Text>
      </Box>
    );
  }
```

- [ ] **Step 6: Run TUI-related tests**

Run: `npm test -- tests/tui-state.test.ts tests/tui-rows.test.ts tests/app-service.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
but status -fv
but commit lazy-inspired-tui-design -m $'feat: add tui branch creation prompts\n\nWhy:\n- Users need direct b and B flows for creating independent and dependent GitButler branches from the TUI.\n- The prompt should keep the main workbench visible and route through AppService.createBranch.\n\nWhat:\n- extract context row helpers for reuse and testing\n- add branch prompt state and b/B input handling\n- submit branch creation through the app service and show activity feedback' --changes <ids>
```

---

### Task 4: Add Lazy-Inspired Layout Components

**Files:**
- Create: `src/tui/layout.tsx`
- Modify: `src/tui/App.tsx`
- Modify: `src/tui/keymap.ts`
- Modify: `tests/tui-state.test.ts`

**Interfaces:**
- Consumes `ContextRow`, `keyHintsForContext`, and current `AppState`.
- Produces reusable components:
  - `Shell`
  - `PaneFrame`
  - `ActivityStrip`
  - `KeyBar`
  - `HelpOverlay`
  - `PromptView`

- [ ] **Step 1: Add key bar coverage for active pane states**

Extend `tests/tui-state.test.ts`:

```ts
  it("keeps branch hints out of disabled states", () => {
    expect(keyHintsForContext({
      pane: "projects",
      hasProject: false,
      hasContext: false,
      hasManagedContext: false
    })).not.toContainEqual(["b", "new branch"]);

    expect(keyHintsForContext({
      pane: "detail",
      hasProject: true,
      hasContext: false,
      hasManagedContext: false
    })).not.toContainEqual(["b", "new branch"]);
  });
```

- [ ] **Step 2: Run key bar tests**

Run: `npm test -- tests/tui-state.test.ts`

Expected: PASS if Task 2 already implemented the helper correctly; otherwise fix helper now.

- [ ] **Step 3: Create layout components**

Create `src/tui/layout.tsx`:

```tsx
import { Box, Text } from "ink";
import type { ReactNode } from "react";

export function Shell({ children }: { children: ReactNode }) {
  return <Box flexDirection="column">{children}</Box>;
}

export function PaneFrame({
  title,
  active,
  width,
  children
}: {
  title: string;
  active: boolean;
  width?: string;
  children: ReactNode;
}) {
  return (
    <Box flexDirection="column" width={width} borderStyle="round" borderColor={active ? "cyan" : "gray"} paddingX={1}>
      <Text bold color={active ? "cyan" : "white"}>{title}</Text>
      {children}
    </Box>
  );
}

export function ActivityStrip({ error, busy, lastSync, warnings }: {
  error?: string;
  busy?: string;
  lastSync?: string;
  warnings: string[];
}) {
  const message = error ? `error: ${error}` : busy ?? lastSync ?? warnings[0] ?? "ready";
  const color = error ? "red" : busy ? "yellow" : warnings.length > 0 ? "yellow" : "green";
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      <Text color={color}>{message}</Text>
    </Box>
  );
}

export function KeyBar({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1} gap={1}>
      {rows.map(([key, label]) => (
        <Text key={`${key}:${label}`}><Text color="cyan">{key}</Text> {label}</Text>
      ))}
    </Box>
  );
}
```

Move existing `HelpOverlay` and `PromptView` from `App.tsx` into this file after adapting imports and prompt types as needed. Export them.

- [ ] **Step 4: Wire layout into `TuiApp`**

In `src/tui/App.tsx`:

- import `Shell`, `PaneFrame`, `ActivityStrip`, `KeyBar`, `HelpOverlay`, and `PromptView`
- import `cyclePane` and `keyHintsForContext`
- replace outer render with `Shell`
- wrap Projects, Contexts, Detail bodies in `PaneFrame`
- render `ActivityStrip` above `KeyBar`
- render `KeyBar` with:

```ts
const keyHints = keyHintsForContext({
  pane,
  hasProject: Boolean(selectedProject),
  hasContext: Boolean(selectedContextRow),
  hasManagedContext: selectedContextRow?.type === "context"
});
```

- update input handling. Ink's key object exposes both `tab` and `shift`, so
  `Shift+Tab` can be handled directly:

```ts
    if (key.tab) {
      setPane((current) => cyclePane(current, key.shift ? -1 : 1));
      return;
    }
```

- [ ] **Step 5: Run TUI tests and typecheck**

Run: `npm test -- tests/tui-state.test.ts tests/tui-rows.test.ts`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
but status -fv
but commit lazy-inspired-tui-design -m $'feat: add lazy-inspired tui shell\n\nWhy:\n- butmux should present projects, contexts, status, and actions as a dense terminal workbench.\n- Context-sensitive key hints and framed panes make the lazygit/lazydocker-inspired workflow discoverable.\n\nWhat:\n- add reusable Ink layout components for panes, activity, and key hints\n- wire the TUI through the lazy-inspired shell\n- add Tab-style pane cycling behavior where supported by Ink' --changes <ids>
```

---

### Task 5: Document And Verify The Lazy-Inspired Workflow

**Files:**
- Modify: `README.md`
- Modify: `tests/release-workflow.test.ts` only if version changes are needed; otherwise leave it unchanged.

**Interfaces:**
- Consumes implemented key behavior and branch creation flow.
- Produces user-facing docs for `b`, `B`, Tab, lazy-style layout, and branch prompts.

- [ ] **Step 1: Add failing README expectations**

Append to an existing README docs test if one exists, otherwise create `tests/readme-tui-docs.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

describe("TUI keyboard documentation", () => {
  it("documents lazy-style navigation and branch creation shortcuts", () => {
    const readme = readFileSync(`${repoRoot}/README.md`, "utf8");

    expect(readme).toContain("Tab / Shift+Tab");
    expect(readme).toContain("b                  create independent branch");
    expect(readme).toContain("B                  create dependent branch from selected context");
    expect(readme).toContain("but branch new <name>");
    expect(readme).toContain("but branch new <name> -a <anchor>");
  });
});
```

- [ ] **Step 2: Run README test and verify it fails**

Run: `npm test -- tests/readme-tui-docs.test.ts`

Expected: FAIL because README does not yet document the new shortcuts.

- [ ] **Step 3: Update README keyboard and agent workflow docs**

In `README.md`, update the Keyboard block:

```text
j/k or Up/Down      move selection
h/l or Left/Right   switch pane
Tab / Shift+Tab     cycle panes
Enter               focus selected workspace, context, or pane
r                   refresh
s                   sync selected project
a                   add project path
b                   create independent branch
B                   create dependent branch from selected context
n                   rename selected managed context
x                   remove selected project or orphan context after confirmation
c                   create selected project's workspace session
[ / ]               reorder selected project or context
,                   cycle terminal backend
?                   show help
q or Ctrl+C         quit
```

Add a short section after Keyboard:

```md
## Branch Creation

Use `b` to create a new independent GitButler branch for the selected project.
butmux runs:

```text
but branch new <name>
```

Use `B` from a managed context row to create a dependent branch anchored to the
selected branch. butmux runs:

```text
but branch new <name> -a <anchor>
```

After creation, butmux syncs the project so the new branch gets its managed
context, tmux session, and terminal tab.
```

Use four-backtick fences around this snippet if editing through a markdown plan.

- [ ] **Step 4: Run README test**

Run: `npm test -- tests/readme-tui-docs.test.ts`

Expected: PASS.

- [ ] **Step 5: Run full verification**

Run: `npm test`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

Run: `git diff --check`

Expected: no output and exit 0.

- [ ] **Step 6: Commit Task 5**

```bash
but status -fv
but commit lazy-inspired-tui-design -m $'docs: document lazy-inspired tui shortcuts\n\nWhy:\n- Users need the README to explain the new b/B branch creation workflow and pane navigation.\n- The branch creation shortcuts map directly to GitButler independent and dependent branch semantics.\n\nWhat:\n- document Tab navigation and b/B branch creation keys\n- describe the GitButler commands behind independent and dependent branch creation\n- add README coverage for the new workflow docs' --changes <ids>
```

---

## Self-Review

- Spec coverage: Tasks cover core branch creation, `b`/`B`, dependent anchors, `Tab`, context-sensitive key hints, prompt behavior, lazy-style shell, activity strip, README, and verification.
- Scope check: The plan is one coherent implementation because the visual shell and branch creation share key handling and prompt state. It avoids search/filter, command palette, and advanced stack editing.
- Type consistency: `CreateBranchInput`, `createGitButlerBranch`, `cyclePane`, `keyHintsForContext`, `ContextRow`, and `selectedBranchAnchor` are named consistently across tasks.
- Execution note: Use `but status -fv` before each commit and substitute actual change IDs in the provided `but commit` commands.
