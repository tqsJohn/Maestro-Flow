import React from 'react';
import { Box, Text } from 'ink';
import type { StatusChangeEntry } from '@shared/agent-types.js';

export function StatusChangeRow({ entry }: { entry: StatusChangeEntry }) {
  return (
    <Box>
      <Text dimColor>[status] {entry.status}{entry.reason ? `: ${entry.reason}` : ''}</Text>
    </Box>
  );
}
