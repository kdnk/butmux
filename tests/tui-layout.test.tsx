import { describe, expect, it } from "vitest";
import { Box, Text, renderToString } from "ink";
import {
  ActivityStrip,
  KeyBar,
  PaneFrame,
  Shell
} from "../src/tui/layout";

describe("TUI layout", () => {
  it("renders the shell, framed panes, activity, and key hints", () => {
    const output = renderToString(
      <Shell
        header={<Text>butmux</Text>}
        activity={<ActivityStrip busy={undefined} error={undefined} lastSync="ready" warnings={[]} />}
        keyBar={<KeyBar rows={[["b", "new branch"], ["B", "branch from selected"]]} />}
      >
        <Box gap={1}>
          <PaneFrame title="Projects" active>
            <Text>repo-a</Text>
          </PaneFrame>
          <PaneFrame title="Contexts" active={false}>
            <Text>feature/base</Text>
          </PaneFrame>
        </Box>
      </Shell>,
      { columns: 100 }
    );

    expect(output).toContain("butmux");
    expect(output).toContain("Projects");
    expect(output).toContain("repo-a");
    expect(output).toContain("Contexts");
    expect(output).toContain("feature/base");
    expect(output).toContain("ready");
    expect(output).toContain("b");
    expect(output).toContain("new branch");
    expect(output).toContain("B");
    expect(output).toContain("branch from selected");
  });
});
