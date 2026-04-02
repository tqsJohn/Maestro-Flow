import React from 'react';
import { Box, Text } from 'ink';
import type { CommandExecEntry } from '@shared/agent-types.js';

export function CommandExecRow({ entry }: { entry: CommandExecEntry }) {
  return (
    <Box gap={1}>
      <Text color="blue">[cmd]</Text>
      <Text>{entry.command}</Text>
      {entry.exitCode != null && (
        <Text color={entry.exitCode === 0 ? 'green' : 'red'}>exit:{entry.exitCode}</Text>
      )}
    </Box>
  );
}
