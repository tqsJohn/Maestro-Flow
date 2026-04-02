import React from 'react';
import { Box, Text } from 'ink';
import type { ToolUseEntry } from '@shared/agent-types.js';

export function ToolUseRow({ entry }: { entry: ToolUseEntry }) {
  return (
    <Box gap={1}>
      <Text color="magenta">[tool]</Text>
      <Text>{entry.name}</Text>
      <Text dimColor>({entry.status})</Text>
    </Box>
  );
}
