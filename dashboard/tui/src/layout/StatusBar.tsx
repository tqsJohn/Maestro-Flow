import React from 'react';
import { Box, Text } from 'ink';

interface StatusBarProps {
  connected: boolean;
  workspace: string;
}

export function StatusBar({ connected, workspace }: StatusBarProps) {
  return (
    <Box borderStyle="single" borderTop borderLeft={false} borderRight={false} borderBottom={false} paddingX={1} justifyContent="space-between">
      <Box>
        <Text color={connected ? 'green' : 'red'}>
          {connected ? '[*] Connected' : '[ ] Disconnected'}
        </Text>
        <Text dimColor> | {workspace}</Text>
      </Box>
      <Text dimColor>1-7: Switch views | q: Quit</Text>
    </Box>
  );
}
