import React from 'react';
import { Box, Text } from 'ink';
import { DataTable, type Column } from '../../components/index.js';
import { useApi } from '../../providers/ApiProvider.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScheduleEntry {
  name: string;
  cron: string;
  type: string;
  enabled: boolean;
  lastRun?: string;
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

const COLUMNS: Column<ScheduleEntry>[] = [
  { key: 'name', label: 'Name', width: 20 },
  { key: 'cron', label: 'Cron', width: 16 },
  { key: 'type', label: 'Type', width: 12 },
  {
    key: 'enabled',
    label: 'Enabled',
    width: 10,
    render: (value) => (
      <Text color={value ? 'green' : 'gray'}>{value ? 'yes' : 'no'}</Text>
    ),
  },
  {
    key: 'lastRun',
    label: 'Last Run',
    width: 20,
    render: (value) => (
      <Text dimColor>{value ? String(value).slice(0, 19) : '-'}</Text>
    ),
  },
];

// ---------------------------------------------------------------------------
// ScheduleTab
// ---------------------------------------------------------------------------

export function ScheduleTab() {
  const { data, loading } = useApi<ScheduleEntry[]>(
    '/api/supervisor/schedules',
    { pollInterval: 10000 },
  );

  return (
    <Box flexDirection="column">
      <Text bold dimColor>Schedules</Text>
      {loading && !data ? (
        <Text dimColor>Loading schedules...</Text>
      ) : (
        <DataTable columns={COLUMNS} data={data ?? []} />
      )}
    </Box>
  );
}
