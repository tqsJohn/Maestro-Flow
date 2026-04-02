import React from 'react';
import { Box, Text } from 'ink';
import type { ErrorEntry } from '@shared/agent-types.js';

export function ErrorRow({ entry }: { entry: ErrorEntry }) {
  return (
    <Box>
      <Text color="red">[error] {entry.message}</Text>
    </Box>
  );
}
