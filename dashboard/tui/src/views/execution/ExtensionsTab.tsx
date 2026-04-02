import React, { useCallback } from 'react';
import { Box, Text } from 'ink';
import { ScrollableList } from '../../components/index.js';
import { useApi } from '../../providers/ApiProvider.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExtensionInfo {
  name: string;
  version: string;
  status: 'loaded' | 'error' | 'disabled';
  description?: string;
}

// ---------------------------------------------------------------------------
// ExtensionsTab
// ---------------------------------------------------------------------------

export function ExtensionsTab() {
  const { data, loading } = useApi<ExtensionInfo[]>(
    '/api/supervisor/extensions',
    { pollInterval: 15000 },
  );

  const renderItem = useCallback(
    (ext: ExtensionInfo, _index: number, isSelected: boolean) => (
      <Box gap={1}>
        <Text color={ext.status === 'loaded' ? 'green' : ext.status === 'error' ? 'red' : 'gray'}>
          [{ext.status}]
        </Text>
        <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
          {ext.name}
        </Text>
        <Text dimColor>v{ext.version}</Text>
      </Box>
    ),
    [],
  );

  if (loading && !data) {
    return <Text dimColor>Loading extensions...</Text>;
  }

  const items = data ?? [];

  return (
    <Box flexDirection="column">
      <Text bold dimColor>Extensions</Text>
      {items.length === 0 ? (
        <Text dimColor>No extensions loaded.</Text>
      ) : (
        <ScrollableList items={items} renderItem={renderItem} />
      )}
    </Box>
  );
}
