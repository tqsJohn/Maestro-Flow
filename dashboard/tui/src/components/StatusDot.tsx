import React from 'react';
import { Text } from 'ink';

// ---------------------------------------------------------------------------
// StatusDot — colored dot indicator mapped from status string
// ---------------------------------------------------------------------------

/** Default color map for phase statuses (terminal-safe color names) */
const DEFAULT_STATUS_COLORS: Record<string, string> = {
  pending: 'gray',
  exploring: 'blue',
  planning: 'magenta',
  executing: 'yellow',
  verifying: 'yellowBright',
  testing: 'blue',
  completed: 'green',
  blocked: 'red',
  // Issue statuses
  open: 'gray',
  registered: 'yellow',
  analyzing: 'blue',
  planned: 'magenta',
  in_progress: 'yellow',
  resolved: 'green',
  closed: 'gray',
  deferred: 'gray',
  // Task statuses
  failed: 'red',
};

export interface StatusDotProps {
  status: string;
  /** Override default status-to-color mapping */
  colorMap?: Record<string, string>;
  /** Show status label after the dot */
  showLabel?: boolean;
}

export function StatusDot({ status, colorMap, showLabel = false }: StatusDotProps) {
  const map = colorMap ?? DEFAULT_STATUS_COLORS;
  const color = map[status] ?? 'white';

  return (
    <Text color={color}>
      *{showLabel ? ` ${status}` : ''}
    </Text>
  );
}
