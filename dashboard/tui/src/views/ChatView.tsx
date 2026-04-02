import React, { useState, useCallback, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { StatusDot } from '../components/index.js';
import { useWs } from '../providers/WsProvider.js';
import { useAgentState } from '../hooks/useAgentState.js';
import { MessageList } from './chat/MessageList.js';
import { SessionSidebar } from './chat/SessionSidebar.js';
import { ChatInput } from './chat/ChatInput.js';
import { SpawnDialog } from './chat/SpawnDialog.js';
import { CliHistorySidebar } from './chat/CliHistorySidebar.js';
import type { AgentConfig } from '@shared/agent-types.js';

// ---------------------------------------------------------------------------
// Focus area for 3-region layout
// ---------------------------------------------------------------------------

type FocusArea = 'sidebar' | 'messages' | 'input';

// ---------------------------------------------------------------------------
// ChatView
// ---------------------------------------------------------------------------

export function ChatView() {
  const [focusArea, setFocusArea] = useState<FocusArea>('messages');
  const [showSpawn, setShowSpawn] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const { send } = useWs();
  const agent = useAgentState();

  const processList = useMemo(
    () => Object.values(agent.processes).sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [agent.processes],
  );

  const activeProcess = agent.activeProcessId ? agent.processes[agent.activeProcessId] : null;
  const activeEntries = agent.activeProcessId ? (agent.entries[agent.activeProcessId] ?? []) : [];
  const activeStreaming = agent.activeProcessId ? agent.streaming[agent.activeProcessId] : false;

  // Active process's pending approval
  const activeApproval = useMemo(() => {
    if (!agent.activeProcessId) return null;
    return Object.values(agent.pendingApprovals).find(
      (a) => a.processId === agent.activeProcessId,
    ) ?? null;
  }, [agent.pendingApprovals, agent.activeProcessId]);

  // Centralized action handlers
  const handleSpawnComplete = useCallback(
    (config: AgentConfig) => {
      send({ action: 'spawn', config });
      setShowSpawn(false);
    },
    [send],
  );

  const handleStop = useCallback(() => {
    if (agent.activeProcessId) {
      send({ action: 'stop', processId: agent.activeProcessId });
    }
  }, [send, agent.activeProcessId]);

  const handleApprove = useCallback(() => {
    if (activeApproval) {
      send({ action: 'approve', processId: agent.activeProcessId!, requestId: activeApproval.id, allow: true });
      agent.resolveApproval(activeApproval.id);
    }
  }, [send, agent.activeProcessId, activeApproval, agent.resolveApproval]);

  const handleDeny = useCallback((reason?: string) => {
    if (activeApproval) {
      send({ action: 'approve', processId: agent.activeProcessId!, requestId: activeApproval.id, allow: false });
      agent.resolveApproval(activeApproval.id);
    }
  }, [send, agent.activeProcessId, activeApproval, agent.resolveApproval]);

  const handleSubmitMessage = useCallback((text: string) => {
    if (agent.activeProcessId) {
      send({ action: 'message', processId: agent.activeProcessId, content: text });
    }
  }, [send, agent.activeProcessId]);

  // Focus cycling
  const FOCUS_ORDER: FocusArea[] = ['sidebar', 'messages', 'input'];

  // Key handler
  useInput((input, key) => {
    if (key.tab) {
      setFocusArea((prev) => FOCUS_ORDER[(FOCUS_ORDER.indexOf(prev) + 1) % FOCUS_ORDER.length]!);
      return;
    }

    if (key.escape) {
      if (showSpawn) { setShowSpawn(false); return; }
      if (showHistory) { setShowHistory(false); return; }
      setFocusArea('messages');
      return;
    }

    if (focusArea !== 'input') {
      if (input === 's') { setShowSpawn(true); return; }
      if (input === 'h') { setShowHistory(true); return; }
      if (input === 'a') { handleApprove(); return; }
      if (input === 'd') { handleDeny(); return; }
      if (input === 'x') { handleStop(); return; }
    }
  }, { isActive: !showSpawn });

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="row" flexGrow={1}>
        {/* Left: Session Sidebar */}
        <SessionSidebar
          processes={processList}
          activeProcessId={agent.activeProcessId}
          onSelect={(id) => agent.setActive(id)}
          onSpawn={() => setShowSpawn(true)}
          isFocused={focusArea === 'sidebar'}
        />

        {/* Right: Messages + Input */}
        <Box flexDirection="column" flexGrow={1}>
          {/* Header */}
          <Box gap={2} marginBottom={1} paddingX={1}>
            <Text bold color="cyan">Chat</Text>
            {activeProcess && <StatusDot status={activeProcess.status} showLabel />}
            {activeProcess && <Text dimColor>{activeProcess.type}</Text>}
            {activeStreaming && <Text color="yellow">streaming...</Text>}
            {activeApproval && <Text color="yellow" bold> [a]pprove/[d]eny</Text>}
          </Box>

          {/* Messages */}
          <Box flexGrow={1}>
            <MessageList entries={activeEntries} isFocused={focusArea === 'messages'} />
          </Box>

          {/* Input */}
          <ChatInput
            onSubmit={handleSubmitMessage}
            activeProcess={activeProcess}
            isFocused={focusArea === 'input'}
            onStop={handleStop}
            onApprove={handleApprove}
            onDeny={handleDeny}
            onSwitch={(id) => agent.setActive(id)}
            pendingApproval={!!activeApproval}
          />
        </Box>

        {/* Overlays */}
        {showSpawn && (
          <SpawnDialog
            onComplete={handleSpawnComplete}
            onCancel={() => setShowSpawn(false)}
          />
        )}
        {showHistory && (
          <CliHistorySidebar onSelect={() => setShowHistory(false)} isFocused />
        )}
      </Box>

      {/* Bottom status bar */}
      <Box paddingX={1}>
        <Text dimColor>Tab=focus s=spawn h=history x=stop a/d=approve Esc=back</Text>
      </Box>
    </Box>
  );
}
