import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { TextInput } from '@inkjs/ui';
import { useInputHistory } from '../../hooks/useInputHistory.js';
import type { AgentProcess } from '@shared/agent-types.js';

// ---------------------------------------------------------------------------
// ChatInput
// ---------------------------------------------------------------------------

interface ChatInputProps {
  onSubmit: (text: string) => void;
  activeProcess: AgentProcess | null;
  isFocused: boolean;
  onStop?: () => void;
  onApprove?: () => void;
  onDeny?: (reason?: string) => void;
  onSwitch?: (id: string) => void;
  pendingApproval?: boolean;
}

export function ChatInput({
  onSubmit,
  activeProcess,
  isFocused,
  onStop,
  onApprove,
  onDeny,
  onSwitch,
  pendingApproval,
}: ChatInputProps) {
  // Increment key to force TextInput remount (clears internal state)
  const [inputKey, setInputKey] = useState(0);
  const [text, setText] = useState('');
  const history = useInputHistory();

  const handleSubmit = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    // Slash commands
    if (trimmed.startsWith('/')) {
      const [cmd, ...args] = trimmed.slice(1).split(/\s+/);
      switch (cmd) {
        case 'stop': onStop?.(); setInputKey((k) => k + 1); setText(''); return;
        case 'approve': onApprove?.(); setInputKey((k) => k + 1); setText(''); return;
        case 'deny': onDeny?.(args.join(' ') || undefined); setInputKey((k) => k + 1); setText(''); return;
        case 'switch': if (args[0]) onSwitch?.(args[0]); setInputKey((k) => k + 1); setText(''); return;
      }
    }

    history.add(trimmed);
    onSubmit(trimmed);
    setInputKey((k) => k + 1);
    setText('');
  }, [onSubmit, onStop, onApprove, onDeny, onSwitch, history]);

  // History navigation
  useInput((_input, key) => {
    if (!isFocused) return;
    if (key.upArrow) {
      const prev = history.up(text);
      if (prev !== null) {
        setText(prev);
        setInputKey((k) => k + 1);
      }
      return;
    }
    if (key.downArrow) {
      const next = history.down(text);
      if (next !== null) {
        setText(next);
        setInputKey((k) => k + 1);
      }
      return;
    }
  }, { isActive: isFocused });

  return (
    <Box
      minHeight={pendingApproval ? 4 : 3}
      borderStyle="single"
      borderColor={isFocused ? 'cyan' : 'gray'}
      paddingX={1}
      flexDirection="column"
    >
      {pendingApproval && (
        <Box>
          <Text color="yellow" bold>Pending approval -- </Text>
          <Text dimColor>/approve or /deny [reason]</Text>
        </Box>
      )}
      <Box>
        <Text color="cyan" bold>{activeProcess?.type ?? 'agent'}</Text>
        <Text dimColor> &gt; </Text>
        {isFocused ? (
          <TextInput
            key={inputKey}
            placeholder="Type message or /command..."
            defaultValue={text}
            onSubmit={handleSubmit}
            onChange={setText}
          />
        ) : (
          <Text dimColor>Tab to focus input</Text>
        )}
      </Box>
    </Box>
  );
}
