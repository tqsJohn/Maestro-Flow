import React, { useCallback } from 'react';
import { Box, Text } from 'ink';
import { ScrollableList } from '../../components/index.js';
import { useApi } from '../../providers/ApiProvider.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CliHistoryItem {
  id: string;
  command: string;
  status: 'running' | 'done' | string;
  startedAt: string;
  tool?: string;
}

// ---------------------------------------------------------------------------
// CliHistorySidebar
// ---------------------------------------------------------------------------

interface CliHistorySidebarProps {
  onSelect: (item: CliHistoryItem) => void;
  isFocused?: boolean;
}

export function CliHistorySidebar({ onSelect, isFocused = true }: CliHistorySidebarProps) {
  const { data: history, loading } = useApi<CliHistoryItem[]>(
    '/api/cli-history?limit=20',
  );

  const renderItem = useCallback(
    (item: CliHistoryItem, _index: number, isSelected: boolean) => (
      <Box gap={1}>
        <Text dimColor>{item.startedAt?.slice(11, 19) ?? ''}</Text>
        <Text color={item.status === 'running' ? 'yellow' : item.status === 'done' ? 'green' : 'gray'}>
          [{item.status}]
        </Text>
        <Text color={isSelected ? 'cyan' : undefined} wrap="truncate">
          {item.command?.slice(0, 60) ?? item.id}
        </Text>
        {item.tool && <Text dimColor>({item.tool})</Text>}
      </Box>
    ),
    [],
  );

  if (loading && !history) {
    return <Text dimColor>Loading CLI history...</Text>;
  }

  const items = history ?? [];

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">CLI History</Text>
        <Text dimColor> ({items.length}) Enter=load | Esc=back</Text>
      </Box>
      <ScrollableList
        items={items}
        renderItem={renderItem}
        onSelect={onSelect}
        isFocused={isFocused}
      />
    </Box>
  );
}
