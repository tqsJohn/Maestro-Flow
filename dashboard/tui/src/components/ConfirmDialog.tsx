import React from 'react';
import { Box, Text, useInput } from 'ink';

export interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps) {
  useInput((_input, key) => {
    if (key.return) onConfirm();
    if (key.escape) onCancel();
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="yellow">{message}</Text>
      <Box marginTop={1}>
        <Text dimColor>Enter: confirm | Esc: cancel</Text>
      </Box>
    </Box>
  );
}
