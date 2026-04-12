import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import Spinner from 'ink-spinner';
import { join } from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import {
  cleanManifestFiles,
  deleteManifest,
  type Manifest,
} from '../../core/manifest.js';
import { deleteOverlayManifest } from '../../core/overlay/applier.js';
import { removeMcpServer } from '../install-backend.js';
import {
  removeMaestroHooks,
  loadClaudeSettings,
  getClaudeSettingsPath,
} from '../hooks.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FlowStep = 'select' | 'confirm' | 'executing' | 'complete';

interface UninstallResult {
  filesRemoved: number;
  filesSkipped: number;
  mcpCleaned: boolean;
  hooksCleaned: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatManifest(m: Manifest): string {
  const date = m.installedAt.split('T')[0];
  return `[${m.scope}] ${m.targetPath} (${m.entries.length} entries, ${date})`;
}

function executeUninstall(manifest: Manifest): UninstallResult {
  const { removed, skipped } = cleanManifestFiles(manifest);

  const targetBase = manifest.scope === 'global' ? homedir() : manifest.targetPath;
  deleteOverlayManifest(manifest.scope, targetBase);

  const mcpCleaned = removeMcpServer(manifest.scope, manifest.targetPath);

  let hooksCleaned = false;
  const settingsPath = manifest.scope === 'global'
    ? getClaudeSettingsPath()
    : join(manifest.targetPath, '.claude', 'settings.json');

  if (existsSync(settingsPath)) {
    const settings = loadClaudeSettings(settingsPath);
    const hadHooks = !!settings.hooks;
    if (settings.statusLine?.command?.includes('maestro')) {
      delete settings.statusLine;
    }
    removeMaestroHooks(settings);
    if (hadHooks && !settings.hooks) hooksCleaned = true;
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  }

  deleteManifest(manifest);
  return { filesRemoved: removed, filesSkipped: skipped, mcpCleaned, hooksCleaned };
}

// ---------------------------------------------------------------------------
// UninstallFlow — root component
// ---------------------------------------------------------------------------

interface UninstallFlowProps {
  manifests: Manifest[];
}

export function UninstallFlow({ manifests }: UninstallFlowProps) {
  const { exit } = useApp();
  const [step, setStep] = useState<FlowStep>(manifests.length === 1 ? 'confirm' : 'select');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selected, setSelected] = useState<Manifest>(manifests[0]);
  const [result, setResult] = useState<UninstallResult | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Timer for executing step
  useEffect(() => {
    if (step !== 'executing') return;
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(timer);
  }, [step]);

  // Execute uninstall
  useEffect(() => {
    if (step !== 'executing') return;
    let cancelled = false;

    // Use setTimeout to let the spinner render first
    const timeout = setTimeout(() => {
      if (cancelled) return;
      try {
        const r = executeUninstall(selected);
        if (!cancelled) {
          setResult(r);
          setStep('complete');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }, 50);

    return () => { cancelled = true; clearTimeout(timeout); };
  }, [step, selected]);

  useInput((input, key) => {
    if (step === 'executing') return;

    if (key.escape) {
      if (step === 'confirm' && manifests.length > 1) {
        setStep('select');
      } else {
        exit();
      }
      return;
    }

    if (step === 'select') {
      if (key.upArrow) {
        setSelectedIndex((i) => (i <= 0 ? manifests.length - 1 : i - 1));
      } else if (key.downArrow) {
        setSelectedIndex((i) => (i >= manifests.length - 1 ? 0 : i + 1));
      } else if (key.return) {
        setSelected(manifests[selectedIndex]);
        setStep('confirm');
      }
    } else if (step === 'confirm') {
      if (key.return) {
        setStep('executing');
      }
    } else if (step === 'complete') {
      if (key.return) exit();
    }
  });

  return (
    <Box flexDirection="column" width="100%">
      {/* Header */}
      <Box paddingX={1}>
        <Text bold color="red">MAESTRO UNINSTALL</Text>
      </Box>

      {/* Content */}
      <Box flexGrow={1} flexDirection="column" paddingX={1} marginTop={1}>
        {/* Select */}
        {step === 'select' && (
          <Box flexDirection="column">
            <Text bold color="cyan">Select installation to remove:</Text>
            <Box flexDirection="column" marginTop={1}>
              {manifests.map((m, i) => (
                <Box key={m.id}>
                  <Text color={i === selectedIndex ? 'cyan' : 'gray'}>
                    {i === selectedIndex ? '>' : ' '} {formatManifest(m)}
                  </Text>
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {/* Confirm */}
        {step === 'confirm' && (
          <Box flexDirection="column">
            <Text bold color="yellow">Confirm Uninstall</Text>
            <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} marginTop={1}>
              <Box>
                <Text bold>{'Scope:'.padEnd(12)}</Text>
                <Text>{selected.scope}</Text>
              </Box>
              <Box>
                <Text bold>{'Target:'.padEnd(12)}</Text>
                <Text>{selected.targetPath}</Text>
              </Box>
              <Box>
                <Text bold>{'Entries:'.padEnd(12)}</Text>
                <Text>{selected.entries.length} files/dirs</Text>
              </Box>
              <Box>
                <Text bold>{'Installed:'.padEnd(12)}</Text>
                <Text>{selected.installedAt.split('T')[0]}</Text>
              </Box>
            </Box>
            <Box marginTop={1}>
              <Text color="yellow">This will remove all tracked files, MCP config, and hooks.</Text>
            </Box>
          </Box>
        )}

        {/* Executing */}
        {step === 'executing' && !error && (
          <Box flexDirection="column">
            <Box>
              <Text color="cyan"><Spinner type="dots" /></Text>
              <Text> Uninstalling...</Text>
            </Box>
            <Box marginTop={1}>
              <Text dimColor>Elapsed: {elapsed}s</Text>
            </Box>
          </Box>
        )}

        {/* Error */}
        {error && (
          <Box flexDirection="column">
            <Text color="red" bold>Uninstall failed</Text>
            <Text color="red">{error}</Text>
          </Box>
        )}

        {/* Complete */}
        {step === 'complete' && result && (
          <Box flexDirection="column">
            <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1}>
              <Text bold color="green">Uninstall Complete</Text>
              <Box>
                <Text color="cyan">{'Removed:'.padEnd(13)}</Text>
                <Text color="green">{result.filesRemoved} files</Text>
              </Box>
              {result.filesSkipped > 0 && (
                <Box>
                  <Text color="cyan">{'Preserved:'.padEnd(13)}</Text>
                  <Text>{result.filesSkipped} settings files</Text>
                </Box>
              )}
              <Box>
                <Text color="cyan">{'MCP:'.padEnd(13)}</Text>
                <Text color={result.mcpCleaned ? 'green' : 'gray'}>
                  {result.mcpCleaned ? 'config cleaned' : 'no config found'}
                </Text>
              </Box>
              <Box>
                <Text color="cyan">{'Hooks:'.padEnd(13)}</Text>
                <Text color={result.hooksCleaned ? 'green' : 'gray'}>
                  {result.hooksCleaned ? 'removed' : 'no hooks found'}
                </Text>
              </Box>
            </Box>
            <Box marginTop={1}>
              <Text dimColor>Restart Claude Code to pick up changes.</Text>
            </Box>
          </Box>
        )}
      </Box>

      {/* Footer */}
      <Box paddingX={1}>
        <Text dimColor>
          {step === 'select' && '[Up/Down] Navigate  [Enter] Select  [Esc] Exit'}
          {step === 'confirm' && '[Enter] Uninstall  [Esc] Back'}
          {step === 'executing' && 'Uninstalling... please wait'}
          {step === 'complete' && '[Enter] Exit'}
        </Text>
      </Box>
    </Box>
  );
}
