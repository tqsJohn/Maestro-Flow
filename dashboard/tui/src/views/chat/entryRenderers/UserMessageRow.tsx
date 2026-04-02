import React from 'react';
import { Box, Text } from 'ink';
import type { UserMessageEntry } from '@shared/agent-types.js';

export function UserMessageRow({ entry }: { entry: UserMessageEntry }) {
  return (
    <Box>
      <Text color="cyan" bold>You: </Text>
      <Text>{entry.content}</Text>
    </Box>
  );
}
