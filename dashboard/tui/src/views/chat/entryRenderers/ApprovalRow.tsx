import React from 'react';
import { Box, Text } from 'ink';
import type { ApprovalRequestEntry, ApprovalResponseEntry } from '@shared/agent-types.js';

export function ApprovalRequestRow({ entry }: { entry: ApprovalRequestEntry }) {
  return (
    <Box borderStyle="single" borderColor="yellow" paddingX={1}>
      <Text color="yellow" bold>Approval: </Text>
      <Text>{entry.toolName}</Text>
      <Text dimColor> [a]llow / [d]eny</Text>
    </Box>
  );
}

export function ApprovalResponseRow({ entry }: { entry: ApprovalResponseEntry }) {
  return (
    <Box>
      <Text dimColor>[{entry.allowed ? 'allowed' : 'denied'}] {entry.requestId}</Text>
    </Box>
  );
}
