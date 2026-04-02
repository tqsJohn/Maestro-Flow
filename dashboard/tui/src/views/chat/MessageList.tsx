import React, { useCallback } from 'react';
import { Box, Text } from 'ink';
import { ScrollableList } from '../../components/index.js';
import type { NormalizedEntry } from '@shared/agent-types.js';

// ---------------------------------------------------------------------------
// Entry rendering by type
// ---------------------------------------------------------------------------

function EntryRow({ entry }: { entry: NormalizedEntry }) {
  switch (entry.type) {
    case 'user_message':
      return (
        <Box>
          <Text color="cyan" bold>You: </Text>
          <Text>{entry.content}</Text>
        </Box>
      );
    case 'assistant_message':
      return (
        <Box>
          <Text color="white">{entry.partial ? entry.content + '...' : entry.content}</Text>
        </Box>
      );
    case 'thinking':
      return (
        <Box>
          <Text dimColor italic>  [thinking] {entry.content.slice(0, 120)}{entry.content.length > 120 ? '...' : ''}</Text>
        </Box>
      );
    case 'tool_use':
      return (
        <Box gap={1}>
          <Text color="magenta">[tool]</Text>
          <Text>{entry.name}</Text>
          <Text dimColor>({entry.status})</Text>
        </Box>
      );
    case 'file_change': {
      const color = entry.action === 'create' ? 'green' : entry.action === 'modify' ? 'yellow' : 'red';
      return (
        <Box gap={1}>
          <Text color={color}>[{entry.action}]</Text>
          <Text>{entry.path}</Text>
        </Box>
      );
    }
    case 'command_exec':
      return (
        <Box gap={1}>
          <Text color="blue">[cmd]</Text>
          <Text>{entry.command}</Text>
          {entry.exitCode != null && (
            <Text color={entry.exitCode === 0 ? 'green' : 'red'}>exit:{entry.exitCode}</Text>
          )}
        </Box>
      );
    case 'approval_request':
      return (
        <Box borderStyle="single" borderColor="yellow" paddingX={1}>
          <Text color="yellow" bold>Approval: </Text>
          <Text>{entry.toolName}</Text>
          <Text dimColor> [a]llow / [d]eny</Text>
        </Box>
      );
    case 'error':
      return (
        <Box>
          <Text color="red">[error] {entry.message}</Text>
        </Box>
      );
    case 'status_change':
      return (
        <Box>
          <Text dimColor>[status] {entry.status}{entry.reason ? `: ${entry.reason}` : ''}</Text>
        </Box>
      );
    case 'token_usage':
      return (
        <Box>
          <Text dimColor>[tokens] in:{entry.inputTokens} out:{entry.outputTokens}</Text>
        </Box>
      );
    case 'approval_response':
      return (
        <Box>
          <Text dimColor>[{entry.allowed ? 'allowed' : 'denied'}] {entry.requestId}</Text>
        </Box>
      );
    default:
      return <Text dimColor>[unknown entry]</Text>;
  }
}

// ---------------------------------------------------------------------------
// MessageList
// ---------------------------------------------------------------------------

interface MessageListProps {
  entries: NormalizedEntry[];
  isFocused?: boolean;
}

export function MessageList({ entries, isFocused = true }: MessageListProps) {
  const renderItem = useCallback(
    (entry: NormalizedEntry, _index: number, _isSelected: boolean) => (
      <EntryRow entry={entry} />
    ),
    [],
  );

  return (
    <ScrollableList
      items={entries}
      renderItem={renderItem}
      isFocused={isFocused}
    />
  );
}
