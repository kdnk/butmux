import type { ReactNode } from "react";
import { Box, Text } from "ink";
import type { AgentPane } from "../core/model";
import {
  agentSummary,
  statusColor,
  statusLabel,
  type WorkbenchRow
} from "./rows";

export function Shell({
  header,
  activity,
  keyBar,
  children
}: {
  header: ReactNode;
  activity: ReactNode;
  keyBar: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box flexDirection="column">
      <Frame title="[0]-butmux" borderColor="cyan">
        {header}
      </Frame>
      {children}
      {activity}
      {keyBar}
    </Box>
  );
}

export function ActivityStrip({
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
  return (
    <Frame title="[2]-Activity" borderColor={color}>
      <Text color={color}>{message}</Text>
    </Frame>
  );
}

export function KeyBar({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return (
    <Frame title="[3]-Keys" borderColor="gray" flexWrap="wrap" gap={1}>
      {rows.map(([keys, label]) => (
        <Text key={`${keys}:${label}`}>
          <Text color="cyan">{keys}</Text> {label}
        </Text>
      ))}
    </Frame>
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
      <Text bold color="cyan">{formatTableRow("Project", "Type", "Name", "Status", "Agents")}</Text>
      {rows.length === 0 ? <Text dimColor>No projects</Text> : null}
      {rows.map((row, index) => {
        const selected = index === selectedIndex;
        const showProjectHeader = index === 0 || rows[index - 1]?.projectRoot !== row.projectRoot;
        return (
          <Box key={rowKey(row)} flexDirection="column">
            {showProjectHeader ? (
              <>
                <Text bold color="cyan">{row.projectName}  {row.projectRoot}</Text>
                {(row.project.warnings ?? []).map((warning, warningIndex) => (
                  <Text key={`${row.projectRoot}:warning:${warningIndex}`} color="yellow">  ! {warning}</Text>
                ))}
              </>
            ) : null}
            <Text
              color={selected ? "cyan" : statusColor(row)}
              inverse={selected}
            >
              {formatTableRow(
                row.projectName,
                row.type,
                row.name,
                statusLabel(row.status),
                agentSummary(row)
              )}
            </Text>
            {detailRows(row).map((detail, detailIndex) => (
              <Text key={`${rowKey(row)}:detail:${detailIndex}`} dimColor>
                {"  "}{detail}
              </Text>
            ))}
          </Box>
        );
      })}
    </Frame>
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
    <Box position="relative">
      <Box
        flexDirection="column"
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

function formatTableRow(project: string, type: string, name: string, status: string, agents: string): string {
  return [
    pad(project, 14),
    pad(type, 10),
    pad(name, 30),
    pad(status, 17),
    agents
  ].join(" ");
}

function pad(value: string, width: number): string {
  return value.length > width ? value.slice(0, width).padEnd(width) : value.padEnd(width);
}

function rowKey(row: WorkbenchRow): string {
  if (row.type === "context") return `context:${row.context.id}`;
  return `workspace:${row.projectRoot}`;
}

function detailRows(row: WorkbenchRow): string[] {
  const detail =
    row.type === "context"
      ? [
          `tmux: ${row.context.tmuxSession}`,
          `terminal: ${row.context.terminalTabTitle}`
        ]
      : [
          `tmux: ${row.workspace?.name ?? "missing tmux"}`,
          `terminal: ${row.workspace?.terminalTabTitle ?? "missing terminal"}`
        ];

  if (row.agentPanes.length === 0) return [...detail, "agents: -"];
  return [
    ...detail,
    ...row.agentPanes.map((pane) => `agent: ${formatAgentPane(pane)}`)
  ];
}

function formatAgentPane(pane: AgentPane): string {
  return `${pane.agent} ${pane.paneId} ${pane.status} ${pane.lastLine}`;
}
