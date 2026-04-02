import React from 'react';
import { Box, Text } from 'ink';
import type { FileChangeEntry } from '@shared/agent-types.js';

export function FileChangeRow({ entry }: { entry: FileChangeEntry }) {
  const color = entry.action === 'create' ? 'green' : entry.action === 'modify' ? 'yellow' : 'red';
  return (
    <Box gap={1}>
      <Text color={color}>[{entry.action}]</Text>
      <Text>{entry.path}</Text>
    </Box>
  );
}
