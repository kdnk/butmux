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
    <Box flexDirection="column" gap={1}>
      <Box borderStyle="single" borderColor="cyan" paddingX={1}>
        {header}
      </Box>
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
    <Box borderStyle="single" borderColor={color} paddingX={1}>
      <Text color={color}>{message}</Text>
    </Box>
  );
}

export function KeyBar({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1} flexWrap="wrap" gap={1}>
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
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
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
    </Box>
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
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} minHeight={5}>
      <Text bold color="cyan">Selected</Text>
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
