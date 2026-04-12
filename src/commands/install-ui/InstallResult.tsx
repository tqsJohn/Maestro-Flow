import React from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import type { InstallFlowResult } from './InstallExecution.js';

// ---------------------------------------------------------------------------
// InstallResult — final summary dashboard
// ---------------------------------------------------------------------------

interface InstallResultProps {
  result: InstallFlowResult;
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <Box>
      <Text color="cyan">{label.padEnd(13)}</Text>
      <Text color={valueColor ?? 'green'}>{value}</Text>
    </Box>
  );
}

export function InstallResult({ result }: InstallResultProps) {
  const { exit } = useApp();

  useInput((_input, key) => {
    if (key.return) exit();
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1}>
        <Text bold color="green">Installation Complete</Text>

        {result.filesInstalled > 0 && (
          <Row label="Files:" value={`${result.filesInstalled} installed`} />
        )}
        {result.dirsCreated > 0 && (
          <Row label="Dirs:" value={`${result.dirsCreated} created`} />
        )}
        {result.filesSkipped > 0 && (
          <Row label="Preserved:" value={`${result.filesSkipped} settings files`} />
        )}
        {result.hooksInstalled > 0 && (
          <Row label="Hooks:" value={`${result.hooksInstalled} installed`} />
        )}
        <Row
          label="MCP:"
          value={result.mcpRegistered ? 'maestro-tools registered' : 'skipped'}
          valueColor={result.mcpRegistered ? 'green' : 'gray'}
        />
        {result.manifestPath && (
          <Box>
            <Text color="cyan">{'Manifest:'.padEnd(13)}</Text>
            <Text dimColor>{result.manifestPath}</Text>
          </Box>
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Restart Claude Code to pick up changes. Press Enter to exit.</Text>
      </Box>
    </Box>
  );
}
