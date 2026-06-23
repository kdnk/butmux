import type { ReactNode } from "react";
import { Box, Text } from "ink";
import type { AppState } from "../core/app-service";
import type { AgentPane } from "../core/model";
import {
  agentSummary,
  detailTitle,
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
    <Frame title="[3]-Activity" borderColor={color}>
      <Text color={color}>{message}</Text>
    </Frame>
  );
}

export function KeyBar({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return (
    <Frame title="[4]-Keys" borderColor="gray" flexWrap="wrap" gap={1}>
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
        return (
          <Text
            key={rowKey(row)}
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
        );
      })}
    </Frame>
  );
}

export function SelectedDetail({
  state,
  row
}: {
  state: AppState;
  row: WorkbenchRow | undefined;
}) {
  const warnings = row ? [...state.warnings, ...(row.project.warnings ?? [])] : state.warnings;
  return (
    <Frame title="[2]-Selected" borderColor="gray" minHeight={5}>
      {row ? (
        <>
          <Text>{detailTitle(row)}</Text>
          <Text dimColor>Project: {row.projectRoot}</Text>
          {row.type === "context" ? (
            <>
              <Text dimColor>tmux: {row.context.tmuxSession}</Text>
              <Text dimColor>terminal: {row.context.terminalTabTitle}</Text>
            </>
          ) : (
            <>
              <Text dimColor>tmux: {row.workspace?.name ?? "missing tmux"}</Text>
              <Text dimColor>terminal: {row.workspace?.terminalTabTitle ?? "missing terminal"}</Text>
            </>
          )}
          {warnings.map((warning, index) => (
            <Text key={`warning-${index}`} color="yellow">! {warning}</Text>
          ))}
          {row.agentPanes.length === 0 ? <Text dimColor>agents: -</Text> : null}
          {row.agentPanes.map((pane) => (
            <Text key={pane.paneId} color={agentColor(pane)}>
              {pane.agent} {pane.paneId} {pane.status} {pane.lastLine}
            </Text>
          ))}
        </>
      ) : (
        <Text dimColor>No selection</Text>
      )}
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
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      minHeight={minHeight}
      flexWrap={flexWrap}
      gap={gap}
    >
      <Text bold color={borderColor}>{title}</Text>
      {children}
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

function agentColor(pane: AgentPane): "green" | "yellow" | "red" | "white" {
  if (pane.status === "running") return "green";
  if (pane.status === "waiting") return "yellow";
  if (pane.status === "error") return "red";
  return "white";
}
