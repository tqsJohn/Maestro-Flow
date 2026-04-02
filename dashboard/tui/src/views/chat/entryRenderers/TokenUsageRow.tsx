import React from 'react';
import { Box, Text } from 'ink';
import type { TokenUsageEntry } from '@shared/agent-types.js';

export function TokenUsageRow({ entry }: { entry: TokenUsageEntry }) {
  return (
    <Box>
      <Text dimColor>[tokens] in:{entry.inputTokens} out:{entry.outputTokens}</Text>
    </Box>
  );
}
