import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { DataTable, StatusDot, type Column } from '../../components/index.js';
import { useWsEvent } from '../../providers/WsProvider.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BoardItem {
  title: string;
  status: string;
  executor?: string;
  issueId?: string;
}

interface ExecutionStartedPayload {
  issueId: string;
  executor: string;
}

interface ExecutionCompletedPayload {
  issueId: string;
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

const COLUMNS: Column<BoardItem>[] = [
  { key: 'title', label: 'Title', width: 30 },
  {
    key: 'status',
    label: 'Status',
    width: 14,
    render: (value) => <StatusDot status={String(value)} showLabel />,
  },
  {
    key: 'executor',
    label: 'Executor',
    width: 16,
    render: (value) => <Text dimColor>{value ? String(value) : '-'}</Text>,
  },
];

// ---------------------------------------------------------------------------
// RequirementBoard
// ---------------------------------------------------------------------------

interface RequirementBoardProps {
  items: BoardItem[];
  onBack: () => void;
}

export function RequirementBoard({ items: initialItems, onBack }: RequirementBoardProps) {
  const [boardItems, setBoardItems] = useState<BoardItem[]>(initialItems);
  const [selectedRow, setSelectedRow] = useState(0);

  const execStarted = useWsEvent<ExecutionStartedPayload>('execution:started');
  const execCompleted = useWsEvent<ExecutionCompletedPayload>('execution:completed');

  // Update board when execution events arrive
  useEffect(() => {
    if (execStarted) {
      setBoardItems((prev) =>
        prev.map((item) =>
          item.issueId === execStarted.issueId
            ? { ...item, status: 'in_progress', executor: execStarted.executor }
            : item,
        ),
      );
    }
  }, [execStarted]);

  useEffect(() => {
    if (execCompleted) {
      setBoardItems((prev) =>
        prev.map((item) =>
          item.issueId === execCompleted.issueId
            ? { ...item, status: 'completed' }
            : item,
        ),
      );
    }
  }, [execCompleted]);

  useInput((_input, key) => {
    if (key.escape) { onBack(); return; }
    if (key.upArrow) setSelectedRow((prev) => Math.max(0, prev - 1));
    if (key.downArrow) setSelectedRow((prev) => Math.min(boardItems.length - 1, prev + 1));
  });

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Requirement Board</Text>
        <Text dimColor> ({boardItems.length} items) Esc=back</Text>
      </Box>
      <DataTable
        columns={COLUMNS}
        data={boardItems}
        selectedIndex={selectedRow}
      />
    </Box>
  );
}
