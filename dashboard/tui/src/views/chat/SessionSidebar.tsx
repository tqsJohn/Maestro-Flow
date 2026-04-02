import React, { useCallback } from 'react';
import { Box, Text } from 'ink';
import { ScrollableList, StatusDot } from '../../components/index.js';
import type { AgentProcess } from '@shared/agent-types.js';

// ---------------------------------------------------------------------------
// SessionSidebar
// ---------------------------------------------------------------------------

interface SessionSidebarProps {
  processes: AgentProcess[];
  activeProcessId: string | null;
  onSelect: (id: string) => void;
  onSpawn: () => void;
  isFocused: boolean;
}

export function SessionSidebar({
  processes,
  activeProcessId,
  onSelect,
  onSpawn,
  isFocused,
}: SessionSidebarProps) {
  const renderItem = useCallback(
    (proc: AgentProcess, _index: number, isSelected: boolean) => (
      <Box gap={1}>
        <StatusDot status={proc.status} showLabel={false} />
        <Text
          color={proc.id === activeProcessId ? 'cyan' : isSelected ? undefined : undefined}
          bold={proc.id === activeProcessId}
        >
          {proc.type}
        </Text>
        <Text dimColor>{proc.id.slice(0, 8)}</Text>
      </Box>
    ),
    [activeProcessId],
  );

  const handleSelect = useCallback(
    (proc: AgentProcess) => {
      onSelect(proc.id);
    },
    [onSelect],
  );

  return (
    <Box
      width={25}
      borderStyle="single"
      borderColor={isFocused ? 'cyan' : 'gray'}
      flexDirection="column"
    >
      <Box paddingX={1} marginBottom={0}>
        <Text bold color="cyan">Sessions</Text>
        <Text dimColor> ({processes.length})</Text>
      </Box>
      {processes.length === 0 ? (
        <Box paddingX={1}>
          <Text dimColor>No sessions</Text>
        </Box>
      ) : (
        <Box flexGrow={1}>
          <ScrollableList
            items={processes}
            renderItem={renderItem}
            onSelect={handleSelect}
            isFocused={isFocused}
          />
        </Box>
      )}
      <Box paddingX={1}>
        <Text dimColor>s=spawn Enter=select</Text>
      </Box>
    </Box>
  );
}
