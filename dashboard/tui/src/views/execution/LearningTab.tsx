import React from 'react';
import { Box, Text } from 'ink';
import { useApi } from '../../providers/ApiProvider.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LearningStats {
  totalCommands: number;
  uniquePatterns: number;
  topPatterns: { pattern: string; count: number }[];
}

// ---------------------------------------------------------------------------
// LearningTab
// ---------------------------------------------------------------------------

export function LearningTab() {
  const { data, loading } = useApi<LearningStats>(
    '/api/supervisor/learning/stats',
    { pollInterval: 15000 },
  );

  if (loading && !data) {
    return <Text dimColor>Loading learning stats...</Text>;
  }

  if (!data) {
    return <Text dimColor>No learning data available.</Text>;
  }

  return (
    <Box flexDirection="column">
      <Text bold dimColor>Learning</Text>
      <Box gap={2} marginTop={1}>
        <Box>
          <Text dimColor>Total commands: </Text>
          <Text>{data.totalCommands}</Text>
        </Box>
        <Box>
          <Text dimColor>Unique patterns: </Text>
          <Text>{data.uniquePatterns}</Text>
        </Box>
      </Box>

      {data.topPatterns.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold dimColor>Top Patterns</Text>
          {data.topPatterns.slice(0, 10).map((p, i) => (
            <Box key={i} gap={1}>
              <Text dimColor>{(i + 1).toString().padStart(2)}.</Text>
              <Text>{p.pattern}</Text>
              <Text dimColor>({p.count})</Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
