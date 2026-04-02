import React from 'react';
import { Box, Text } from 'ink';
import type { ThinkingEntry } from '@shared/agent-types.js';

export function ThinkingRow({ entry }: { entry: ThinkingEntry }) {
  return (
    <Box>
      <Text dimColor italic>  [thinking] {entry.content.slice(0, 120)}{entry.content.length > 120 ? '...' : ''}</Text>
    </Box>
  );
}
