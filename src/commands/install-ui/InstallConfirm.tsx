import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { HookLevel } from '../hooks.js';
import { HOOK_LEVEL_DESCRIPTIONS } from '../hooks.js';

// ---------------------------------------------------------------------------
// InstallConfirm — summary before execution
// ---------------------------------------------------------------------------

export interface InstallFlowConfig {
  mode: 'global' | 'project';
  projectPath: string;
  installComponents: boolean;
  installHooks: boolean;
  installMcp: boolean;
  hookLevel: HookLevel;
  componentCount: number;
  fileCount: number;
  mcpToolCount: number;
  selectedComponentIds: string[];
  mcpTools: string[];
  mcpProjectRoot: string;
}

interface InstallConfirmProps {
  config: InstallFlowConfig;
  onConfirm: () => void;
  onBack: () => void;
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <Box>
      <Text bold>{label.padEnd(14)}</Text>
      <Text color={valueColor}>{value}</Text>
    </Box>
  );
}

export function InstallConfirm({ config, onConfirm, onBack }: InstallConfirmProps) {
  useInput((_input, key) => {
    if (key.return) onConfirm();
    if (key.escape) onBack();
  });

  const target = config.mode === 'global'
    ? '~/.maestro/ + ~/.claude/'
    : config.projectPath || './';

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">Installation Summary</Text>

      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} marginTop={1}>
        <Row label="Mode:" value={config.mode} />
        <Row label="Target:" value={target} />

        {config.installComponents ? (
          <Row
            label="Components:"
            value={`${config.componentCount} selected (${config.fileCount} files)`}
            valueColor="green"
          />
        ) : (
          <Row label="Components:" value="skipped" valueColor="gray" />
        )}

        {config.installHooks ? (
          <Row
            label="Hooks:"
            value={`${config.hookLevel} — ${HOOK_LEVEL_DESCRIPTIONS[config.hookLevel]}`}
            valueColor="green"
          />
        ) : (
          <Row label="Hooks:" value="skipped" valueColor="gray" />
        )}

        {config.installMcp ? (
          <Row
            label="MCP Server:"
            value={`${config.mcpToolCount} tools (${config.mcpTools.join(', ')})`}
            valueColor="green"
          />
        ) : (
          <Row label="MCP Server:" value="skipped" valueColor="gray" />
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>[Enter] Install  [Esc] Back</Text>
      </Box>
    </Box>
  );
}
