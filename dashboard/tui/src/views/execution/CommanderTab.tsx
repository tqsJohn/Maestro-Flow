import React from 'react';
import { Box, Text } from 'ink';
import { useWsEvent } from '../../providers/WsProvider.js';
import { useApi } from '../../providers/ApiProvider.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommanderStatus {
  state: string;
  activeWorkers: number;
  totalTicks: number;
  lastError?: string;
}

interface CommanderDecision {
  action: string;
  issueId?: string;
  reason?: string;
  timestamp: string;
}

interface CommanderConfig {
  pollIntervalMs: number;
  maxConcurrentWorkers: number;
  decisionModel: string;
  autoApproveThreshold: string;
  profile: string;
}

// ---------------------------------------------------------------------------
// CommanderTab
// ---------------------------------------------------------------------------

export function CommanderTab() {
  const status = useWsEvent<CommanderStatus>('commander:status');
  const decision = useWsEvent<CommanderDecision>('commander:decision');
  const { data: config } = useApi<CommanderConfig>('/api/commander/config');

  return (
    <Box flexDirection="column">
      <Text bold dimColor>Commander</Text>

      {/* Status */}
      <Box flexDirection="column" marginTop={1}>
        <Box gap={2}>
          <Box>
            <Text dimColor>State: </Text>
            <Text color={status?.state === 'running' ? 'green' : status?.state === 'paused' ? 'yellow' : 'gray'}>
              {status?.state ?? 'unknown'}
            </Text>
          </Box>
          <Box>
            <Text dimColor>Workers: </Text>
            <Text>{status?.activeWorkers ?? 0}</Text>
          </Box>
          <Box>
            <Text dimColor>Ticks: </Text>
            <Text>{status?.totalTicks ?? 0}</Text>
          </Box>
        </Box>
        {status?.lastError && (
          <Text color="red">Error: {status.lastError}</Text>
        )}
      </Box>

      {/* Last Decision */}
      {decision && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold dimColor>Last Decision</Text>
          <Box gap={1}>
            <Text color="cyan">{decision.action}</Text>
            {decision.issueId && <Text dimColor>issue: {decision.issueId}</Text>}
          </Box>
          {decision.reason && <Text dimColor>{decision.reason}</Text>}
        </Box>
      )}

      {/* Config */}
      {config && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold dimColor>Config</Text>
          <Box gap={1}><Text dimColor>Profile:</Text><Text>{config.profile}</Text></Box>
          <Box gap={1}><Text dimColor>Model:</Text><Text>{config.decisionModel}</Text></Box>
          <Box gap={1}><Text dimColor>Max workers:</Text><Text>{config.maxConcurrentWorkers}</Text></Box>
          <Box gap={1}><Text dimColor>Auto-approve:</Text><Text>{config.autoApproveThreshold}</Text></Box>
          <Box gap={1}><Text dimColor>Poll interval:</Text><Text>{config.pollIntervalMs}ms</Text></Box>
        </Box>
      )}
    </Box>
  );
}
