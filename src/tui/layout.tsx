import type { ReactNode } from "react";
import { Box, Text } from "ink";
import {
  agentSummary,
  statusColor,
  statusLabel,
  type WorkbenchRow
} from "./rows";

export function Shell({
  header,
  keyBar,
  children
}: {
  header: ReactNode;
  keyBar: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box flexDirection="column">
      <Frame title="[0]-butmux" borderColor="cyan">
        {header}
      </Frame>
      {children}
      {keyBar}
    </Box>
  );
}

export function HeaderStatus({
  error,
  busy,
  lastSync,
  warnings
}: {
  error: string | undefined;
  busy: string | undefined;
  lastSync: string | undefined;
  warnings: string[];
}) {
  const message = error ? `error: ${error}` : busy ?? lastSync ?? warnings[0] ?? "ready";
  const color = error ? "red" : busy ? "yellow" : warnings.length > 0 ? "yellow" : "green";
  return <Text color={color}>{message}</Text>;
}

export function KeyBar({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return (
    <Box width="100%" flexWrap="wrap" gap={1} paddingX={1}>
      {rows.map(([keys, label]) => (
        <Text key={`${keys}:${label}`}>
          <Text color="cyan">{keys}</Text> {label}
        </Text>
      ))}
    </Box>
  );
}

export function WorkbenchTable({
  rows,
  selectedIndex
}: {
  rows: WorkbenchRow[];
  selectedIndex: number;
}) {
  return (
    <Frame title="[1]-Workspaces" borderColor="cyan">
      <Text bold color="cyan">{formatTableRow("Kind", "Name", "Status", "Agents")}</Text>
      {rows.length === 0 ? <Text dimColor>No projects</Text> : null}
      {rows.map((row, index) => {
        const selected = index === selectedIndex;
        const showProjectHeader = index === 0 || rows[index - 1]?.projectRoot !== row.projectRoot;
        return (
          <Box key={rowKey(row)} flexDirection="column">
            {showProjectHeader ? (
              <>
                {index > 0 ? <ProjectSeparator /> : null}
                <Text bold color="cyan">{row.projectName}  {row.projectRoot}</Text>
                {(row.project.warnings ?? []).map((warning, warningIndex) => (
                  <Text key={`${row.projectRoot}:warning:${warningIndex}`} color="yellow">  ! {warning}</Text>
                ))}
              </>
            ) : null}
            <TableRow row={row} selected={selected} />
          </Box>
        );
      })}
    </Frame>
  );
}

function ProjectSeparator() {
  return <Text dimColor wrap="truncate">{"─".repeat(200)}</Text>;
}

function TableRow({
  row,
  selected
}: {
  row: WorkbenchRow;
  selected: boolean;
}) {
  return (
    <Text
      color={selected ? "cyan" : statusColor(row)}
      inverse={selected}
      wrap="truncate"
    >
      {formatTableRow(
        rowKindLabel(row),
        row.name,
        statusLabel(row.status),
        agentSummary(row)
      )}
    </Text>
  );
}

function Frame({
  title,
  borderColor,
  minHeight,
  flexWrap,
  gap,
  children
}: {
  title: string;
  borderColor: "cyan" | "gray" | "green" | "yellow" | "red";
  minHeight?: number;
  flexWrap?: "wrap";
  gap?: number;
  children: ReactNode;
}) {
  return (
    <Box position="relative" width="100%">
      <Box
        flexDirection="column"
        width="100%"
        borderStyle="round"
        borderColor={borderColor}
        paddingX={1}
        minHeight={minHeight}
        flexWrap={flexWrap}
        gap={gap}
      >
        {children}
      </Box>
      <Box position="absolute" top={0} left={1}>
        <Text bold color={borderColor}>{title}</Text>
      </Box>
    </Box>
  );
}

function formatTableRow(kind: string, name: string, status: string, agents: string): string {
  return [
    pad(kind, 10),
    pad(name, 38),
    pad(status, 21),
    agents
  ].join(" ");
}

function rowKindLabel(row: WorkbenchRow): string {
  if (row.type === "context") return "branch";
  if (row.type === "pane") return "agent";
  return "workspace";
}

function pad(value: string, width: number): string {
  const clipped = sliceToDisplayWidth(value, width);
  return `${clipped}${" ".repeat(Math.max(0, width - displayWidth(clipped)))}`;
}

function sliceToDisplayWidth(value: string, width: number): string {
  let next = "";
  let used = 0;
  for (const char of value) {
    const charWidth = characterDisplayWidth(char);
    if (charWidth > 0 && used + charWidth > width) break;
    next += char;
    used += charWidth;
  }
  return next;
}

function displayWidth(value: string): number {
  let width = 0;
  for (const char of value) width += characterDisplayWidth(char);
  return width;
}

function characterDisplayWidth(char: string): number {
  if (/[\u0300-\u036f\ufe00-\ufe0f]/u.test(char)) return 0;
  if (/\p{Extended_Pictographic}/u.test(char)) return 2;
  return 1;
}

function rowKey(row: WorkbenchRow): string {
  if (row.type === "context") return `context:${row.context.id}`;
  if (row.type === "pane") return `pane:${rowKey(row.parent)}:${row.pane.paneId}`;
  return `workspace:${row.projectRoot}`;
}
