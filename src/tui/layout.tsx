import type { ReactNode } from "react";
import { Box, Text, type BoxProps } from "ink";

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

export function PaneFrame({
  title,
  active,
  width,
  flexGrow,
  children
}: {
  title: string;
  active: boolean;
  width?: BoxProps["width"];
  flexGrow?: number;
  children: ReactNode;
}) {
  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={active ? "cyan" : "gray"}
      paddingX={1}
      width={width}
      flexGrow={flexGrow}
      minHeight={6}
    >
      <Text bold color={active ? "cyan" : "white"}>{title}</Text>
      {children}
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
