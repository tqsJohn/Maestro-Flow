import React, { useState, useCallback, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { TextInput, Select } from '@inkjs/ui';
import { ScrollableList, SplitPane, StatusDot } from '../components/index.js';
import { useWs } from '../providers/WsProvider.js';
import { useAgentState } from '../hooks/useAgentState.js';
import { MessageList } from './chat/MessageList.js';
import { CliHistorySidebar } from './chat/CliHistorySidebar.js';
import type { AgentProcess, AgentType, AgentConfig } from '@shared/agent-types.js';

// ---------------------------------------------------------------------------
// Mode state machine
// ---------------------------------------------------------------------------

type Mode = 'sessions' | 'chat' | 'spawn' | 'message' | 'history';

// ---------------------------------------------------------------------------
// Spawn form
// ---------------------------------------------------------------------------

type SpawnStep = 'type' | 'prompt' | 'workDir' | 'approvalMode';
const SPAWN_STEPS: SpawnStep[] = ['type', 'prompt', 'workDir', 'approvalMode'];

const AGENT_TYPE_OPTIONS = [
  { label: 'Claude Code', value: 'claude-code' },
  { label: 'Codex', value: 'codex' },
  { label: 'Gemini', value: 'gemini' },
  { label: 'Qwen', value: 'qwen' },
  { label: 'OpenCode', value: 'opencode' },
];

const APPROVAL_OPTIONS = [
  { label: 'Suggest (manual)', value: 'suggest' },
  { label: 'Auto (auto-approve)', value: 'auto' },
];

// ---------------------------------------------------------------------------
// ChatView
// ---------------------------------------------------------------------------

export function ChatView() {
  const [mode, setMode] = useState<Mode>('sessions');
  const [messageText, setMessageText] = useState('');

  // Spawn form state
  const [spawnStep, setSpawnStep] = useState<SpawnStep>('type');
  const [spawnType, setSpawnType] = useState<AgentType>('claude-code');
  const [spawnPrompt, setSpawnPrompt] = useState('');
  const [spawnWorkDir, setSpawnWorkDir] = useState(process.cwd());

  const { send } = useWs();
  const agent = useAgentState();

  const processList = useMemo(
    () => Object.values(agent.processes).sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [agent.processes],
  );

  const activeProcess = agent.activeProcessId ? agent.processes[agent.activeProcessId] : null;
  const activeEntries = agent.activeProcessId ? (agent.entries[agent.activeProcessId] ?? []) : [];
  const activeThought = agent.activeProcessId ? agent.thoughts[agent.activeProcessId] : undefined;
  const activeStreaming = agent.activeProcessId ? agent.streaming[agent.activeProcessId] : false;

  // Active process's pending approval
  const activeApproval = useMemo(() => {
    if (!agent.activeProcessId) return null;
    return Object.values(agent.pendingApprovals).find(
      (a) => a.processId === agent.activeProcessId,
    ) ?? null;
  }, [agent.pendingApprovals, agent.activeProcessId]);

  // Cycle to next/prev session
  const cycleSession = useCallback((dir: 1 | -1) => {
    if (processList.length === 0) return;
    const idx = processList.findIndex((p) => p.id === agent.activeProcessId);
    const next = (idx + dir + processList.length) % processList.length;
    agent.setActive(processList[next]!.id);
  }, [processList, agent]);

  // Select session from list
  const handleSelectSession = useCallback((proc: AgentProcess) => {
    agent.setActive(proc.id);
    setMode('chat');
  }, [agent]);

  // Reset spawn form
  const resetSpawn = useCallback(() => {
    setSpawnStep('type');
    setSpawnType('claude-code');
    setSpawnPrompt('');
    setSpawnWorkDir(process.cwd());
  }, []);

  // Submit spawn
  const submitSpawn = useCallback((approvalMode: 'suggest' | 'auto') => {
    const config: AgentConfig = {
      type: spawnType,
      prompt: spawnPrompt,
      workDir: spawnWorkDir,
      approvalMode,
    };
    send({ action: 'spawn', config });
    resetSpawn();
    setMode('sessions');
  }, [send, spawnType, spawnPrompt, spawnWorkDir, resetSpawn]);

  // Send follow-up message
  const submitMessage = useCallback(() => {
    const text = messageText.trim();
    if (!text || !agent.activeProcessId) return;
    send({ action: 'message', processId: agent.activeProcessId, content: text });
    setMessageText('');
    setMode('chat');
  }, [send, messageText, agent.activeProcessId]);

  // Session list renderer (must be before any early returns — hooks rule)
  const renderSession = useCallback(
    (proc: AgentProcess, _index: number, isSelected: boolean) => (
      <Box gap={1}>
        <StatusDot status={proc.status} showLabel={false} />
        <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
          {proc.type}
        </Text>
        <Text dimColor>{proc.id.slice(0, 12)}</Text>
        <Text dimColor>{proc.startedAt?.slice(11, 19) ?? ''}</Text>
      </Box>
    ),
    [],
  );

  // Global key handler
  useInput((input, key) => {
    if (key.escape) {
      if (mode === 'chat') { setMode('sessions'); return; }
      if (mode === 'spawn') { resetSpawn(); setMode('sessions'); return; }
      if (mode === 'message') { setMessageText(''); setMode('chat'); return; }
      if (mode === 'history') { setMode('sessions'); return; }
      return;
    }

    if (mode === 'sessions') {
      if (input === 's') { resetSpawn(); setMode('spawn'); return; }
      if (input === 'h') { setMode('history'); return; }
    }

    if (mode === 'chat') {
      if (input === 's') { resetSpawn(); setMode('spawn'); return; }
      if (input === 'm' && activeProcess?.status === 'running') {
        setMessageText('');
        setMode('message');
        return;
      }
      if (input === 'x' && agent.activeProcessId) {
        send({ action: 'stop', processId: agent.activeProcessId });
        return;
      }
      if (input === 'a' && activeApproval) {
        send({ action: 'approve', processId: agent.activeProcessId!, requestId: activeApproval.id, allow: true });
        agent.resolveApproval(activeApproval.id);
        return;
      }
      if (input === 'd' && activeApproval) {
        send({ action: 'approve', processId: agent.activeProcessId!, requestId: activeApproval.id, allow: false });
        agent.resolveApproval(activeApproval.id);
        return;
      }
      if (key.tab) { cycleSession(1); return; }
    }
  }, { isActive: mode !== 'message' && mode !== 'spawn' });

  // -------------------------------------------------------------------------
  // Render: history mode
  // -------------------------------------------------------------------------
  if (mode === 'history') {
    return (
      <CliHistorySidebar
        onSelect={() => setMode('sessions')}
        isFocused
      />
    );
  }

  // -------------------------------------------------------------------------
  // Render: spawn mode
  // -------------------------------------------------------------------------
  if (mode === 'spawn') {
    const stepIndex = SPAWN_STEPS.indexOf(spawnStep);
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">Spawn Agent</Text>
          <Text dimColor> (Step {stepIndex + 1}/{SPAWN_STEPS.length}) Esc=cancel</Text>
        </Box>

        <Box gap={1} marginBottom={1}>
          {SPAWN_STEPS.map((s, i) => (
            <Text key={s} bold={s === spawnStep} color={i < stepIndex ? 'green' : s === spawnStep ? 'cyan' : 'gray'}>
              {i < stepIndex ? '[x]' : s === spawnStep ? '[>]' : '[ ]'} {s}
            </Text>
          ))}
        </Box>

        {spawnStep === 'type' && (
          <Box flexDirection="column">
            <Text>Agent Type:</Text>
            <Select
              options={AGENT_TYPE_OPTIONS}
              defaultValue={spawnType}
              onChange={(value) => {
                setSpawnType(value as AgentType);
                setSpawnStep('prompt');
              }}
            />
          </Box>
        )}

        {spawnStep === 'prompt' && (
          <Box flexDirection="column">
            <Text>Prompt:</Text>
            <TextInput
              placeholder="Enter agent prompt..."
              defaultValue={spawnPrompt}
              onChange={setSpawnPrompt}
              onSubmit={() => setSpawnStep('workDir')}
            />
          </Box>
        )}

        {spawnStep === 'workDir' && (
          <Box flexDirection="column">
            <Text>Working Directory:</Text>
            <TextInput
              placeholder={process.cwd()}
              defaultValue={spawnWorkDir}
              onChange={setSpawnWorkDir}
              onSubmit={() => setSpawnStep('approvalMode')}
            />
          </Box>
        )}

        {spawnStep === 'approvalMode' && (
          <Box flexDirection="column">
            <Text>Approval Mode:</Text>
            <Select
              options={APPROVAL_OPTIONS}
              defaultValue="suggest"
              onChange={(value) => submitSpawn(value as 'suggest' | 'auto')}
            />
          </Box>
        )}

        {stepIndex > 0 && (
          <Box flexDirection="column" marginTop={1} borderStyle="single" paddingX={1}>
            <Text dimColor bold>Filled:</Text>
            <Text dimColor>  Type: {spawnType}</Text>
            {spawnPrompt && <Text dimColor>  Prompt: {spawnPrompt.slice(0, 60)}{spawnPrompt.length > 60 ? '...' : ''}</Text>}
            {stepIndex > 2 && <Text dimColor>  WorkDir: {spawnWorkDir}</Text>}
          </Box>
        )}
      </Box>
    );
  }

  // -------------------------------------------------------------------------
  // Render: message mode (TextInput overlay on chat)
  // -------------------------------------------------------------------------
  if (mode === 'message') {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">Send Message</Text>
          <Text dimColor> to {activeProcess?.type ?? 'agent'} | Esc=cancel</Text>
        </Box>
        <TextInput
          placeholder="Type your message..."
          defaultValue={messageText}
          onChange={setMessageText}
          onSubmit={submitMessage}
        />
      </Box>
    );
  }

  // -------------------------------------------------------------------------
  // Render: chat mode
  // -------------------------------------------------------------------------
  if (mode === 'chat' && activeProcess) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box marginBottom={1} gap={2}>
          <Text bold color="cyan">Chat</Text>
          <StatusDot status={activeProcess.status} showLabel />
          <Text dimColor>{activeProcess.type}</Text>
          <Text dimColor>({activeEntries.length} entries)</Text>
          {activeStreaming && <Text color="yellow">streaming...</Text>}
        </Box>
        <SplitPane
          ratio={70}
          left={<MessageList entries={activeEntries} />}
          right={
            <Box flexDirection="column" paddingLeft={1}>
              <Text bold dimColor>Process Info</Text>
              <Box gap={1}><Text dimColor>ID:</Text><Text>{activeProcess.id.slice(0, 12)}</Text></Box>
              <Box gap={1}><Text dimColor>Type:</Text><Text>{activeProcess.type}</Text></Box>
              <Box gap={1}><Text dimColor>Status:</Text><StatusDot status={activeProcess.status} showLabel /></Box>
              <Box gap={1}><Text dimColor>Started:</Text><Text>{activeProcess.startedAt?.slice(11, 19) ?? '-'}</Text></Box>
              {activeThought && (
                <Box flexDirection="column" marginTop={1}>
                  <Text bold dimColor>Thinking</Text>
                  <Text color="magenta">{activeThought.subject}</Text>
                  <Text dimColor>{activeThought.description}</Text>
                </Box>
              )}
              {activeApproval && (
                <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="yellow" paddingX={1}>
                  <Text bold color="yellow">Pending Approval</Text>
                  <Text>{activeApproval.toolName}</Text>
                  <Text dimColor>[a]llow / [d]eny</Text>
                </Box>
              )}
            </Box>
          }
        />
        <Box marginTop={1}>
          <Text dimColor>s=spawn m=message x=stop a/d=approve Tab=cycle Esc=back</Text>
        </Box>
      </Box>
    );
  }

  // -------------------------------------------------------------------------
  // Render: sessions mode (default)
  // -------------------------------------------------------------------------
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1} gap={2}>
        <Text bold color="cyan">Agent Sessions</Text>
        <Text dimColor>({processList.length} sessions)</Text>
      </Box>
      {processList.length === 0 ? (
        <Text dimColor>No agent sessions. Press [s] to spawn.</Text>
      ) : (
        <ScrollableList
          items={processList}
          renderItem={renderSession}
          onSelect={handleSelectSession}
        />
      )}
      <Box marginTop={1}>
        <Text dimColor>s=spawn h=history Enter=select</Text>
      </Box>
    </Box>
  );
}
