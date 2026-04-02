import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import {
  ScrollableList,
  FilterBar,
  StatusDot,
} from '../components/index.js';
import { useApi } from '../providers/ApiProvider.js';

// ---------------------------------------------------------------------------
// Shared types (re-declared to avoid cross-package import issues at runtime)
// ---------------------------------------------------------------------------

interface PipelineNode {
  id: string;
  name: string;
  status: 'done' | 'in_progress' | 'pending' | 'skipped';
  wave?: number;
}

interface TeamRole {
  name: string;
  prefix: string;
  status: 'done' | 'active' | 'pending' | 'injected';
  taskCount: number;
  innerLoop: boolean;
  injected?: boolean;
  injectionReason?: string;
}

interface TeamMessage {
  id: string;
  ts: string;
  from: string;
  to: string;
  type: string;
  summary: string;
}

interface SessionFileEntry {
  id: string;
  path: string;
  name: string;
  category: string;
  status?: string;
  isNew?: boolean;
}

interface TeamSessionSummary {
  sessionId: string;
  title: string;
  description: string;
  status: 'active' | 'completed' | 'failed' | 'archived';
  skill: string;
  roles: string[];
  taskProgress: { completed: number; total: number };
  messageCount: number;
  duration: string;
  createdAt: string;
  updatedAt: string;
  pipelineStages: PipelineNode[];
}

interface TeamSessionDetail extends TeamSessionSummary {
  roleDetails: TeamRole[];
  messages: TeamMessage[];
  files: SessionFileEntry[];
  pipeline: { waves: { number: number; nodes: PipelineNode[] }[] };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SKILL_PREFIX_MAP: Record<string, string> = {
  'TC-': 'Coordinate',
  'TLV4-': 'Lifecycle',
  'QA-': 'QA',
  'RV-': 'Review',
  'TST-': 'Testing',
  'TFD-': 'Frontend Debug',
  'TPO-': 'Perf Opt',
  'TTD-': 'Tech Debt',
  'TPX-': 'Plan & Execute',
  'TBS-': 'Brainstorm',
  'TRD-': 'Roadmap Dev',
  'TIS-': 'Issue',
  'TID-': 'Iter Dev',
  'TUA-': 'Ultra Analyze',
  'TUX-': 'UX Improve',
  'TUI-': 'UI Design',
  'TAO-': 'Arch Opt',
};

function inferSkill(sessionId: string): string {
  for (const [prefix, label] of Object.entries(SKILL_PREFIX_MAP)) {
    if (sessionId.startsWith(prefix)) return label;
  }
  return 'Team';
}

const STATUS_COLORS: Record<string, string> = {
  active: 'yellow',
  completed: 'green',
  failed: 'red',
  archived: 'gray',
  done: 'green',
  in_progress: 'yellow',
  pending: 'gray',
  skipped: 'gray',
  injected: 'magenta',
};

const DETAIL_TABS = ['Pipeline', 'Roles', 'Messages', 'Files'] as const;

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const width = 12;
  const pct = total > 0 ? completed / total : 0;
  const filled = Math.round(pct * width);
  const empty = width - filled;
  return (
    <Text>
      <Text color="green">{'#'.repeat(filled)}</Text>
      <Text dimColor>{'-'.repeat(empty)}</Text>
      <Text dimColor> {completed}/{total}</Text>
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Detail tab content
// ---------------------------------------------------------------------------

function PipelineTab({ detail }: { detail: TeamSessionDetail }) {
  const nodes = detail.pipeline?.waves
    ? detail.pipeline.waves.flatMap((w) => w.nodes)
    : detail.pipelineStages ?? [];

  if (nodes.length === 0) {
    return <Text dimColor>No pipeline nodes.</Text>;
  }

  return (
    <Box flexDirection="column">
      {nodes.map((node) => (
        <Box key={node.id} gap={1}>
          <StatusDot status={node.status} colorMap={STATUS_COLORS} />
          <Text>{node.name}</Text>
          <Text dimColor>({node.status})</Text>
          {node.wave != null && <Text dimColor>wave:{node.wave}</Text>}
        </Box>
      ))}
    </Box>
  );
}

function RolesTab({ detail }: { detail: TeamSessionDetail }) {
  const roles = detail.roleDetails ?? [];
  if (roles.length === 0) {
    return <Text dimColor>No role details.</Text>;
  }

  return (
    <Box flexDirection="column">
      <Box gap={2}>
        <Box width={16}><Text bold>Role</Text></Box>
        <Box width={8}><Text bold>Status</Text></Box>
        <Box width={6}><Text bold>Tasks</Text></Box>
        <Box width={6}><Text bold>Loop</Text></Box>
      </Box>
      {roles.map((role) => (
        <Box key={role.prefix} gap={2}>
          <Box width={16}>
            <Text>{role.name}</Text>
          </Box>
          <Box width={8}>
            <StatusDot status={role.status} colorMap={STATUS_COLORS} showLabel />
          </Box>
          <Box width={6}>
            <Text>{role.taskCount}</Text>
          </Box>
          <Box width={6}>
            <Text dimColor>{role.innerLoop ? 'yes' : 'no'}</Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function MessagesTab({ detail }: { detail: TeamSessionDetail }) {
  const messages = detail.messages ?? [];
  if (messages.length === 0) {
    return <Text dimColor>No messages.</Text>;
  }

  return (
    <Box flexDirection="column">
      {messages.map((msg) => (
        <Box key={msg.id} gap={1}>
          <Text dimColor>{msg.ts.slice(11, 19)}</Text>
          <Text color="cyan">{msg.from}</Text>
          <Text dimColor>-{'>'}</Text>
          <Text color="yellow">{msg.to}</Text>
          <Text> {msg.summary}</Text>
        </Box>
      ))}
    </Box>
  );
}

function FilesTab({ detail }: { detail: TeamSessionDetail }) {
  const files = detail.files ?? [];
  if (files.length === 0) {
    return <Text dimColor>No files.</Text>;
  }

  return (
    <Box flexDirection="column">
      {files.map((file) => (
        <Box key={file.id} gap={1}>
          <Text dimColor>[{file.category}]</Text>
          <Text color={file.isNew ? 'green' : undefined}>{file.name}</Text>
          {file.status && <Text dimColor>({file.status})</Text>}
        </Box>
      ))}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// TeamView
// ---------------------------------------------------------------------------

export function TeamView() {
  const [mode, setMode] = useState<'list' | 'detail'>('list');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);

  // List mode data
  const { data: sessions, loading, error } = useApi<TeamSessionSummary[]>(
    '/api/teams/sessions',
  );

  // Detail mode data
  const { data: detail } = useApi<TeamSessionDetail>(
    `/api/teams/sessions/${selectedSessionId}`,
    { skip: !selectedSessionId || mode !== 'detail' },
  );

  // Escape from detail back to list
  useInput(
    (_input, key) => {
      if (key.escape && mode === 'detail') {
        setMode('list');
        setSelectedSessionId(null);
      }
    },
    { isActive: mode === 'detail' },
  );

  const handleSelectSession = useCallback(
    (session: TeamSessionSummary) => {
      setSelectedSessionId(session.sessionId);
      setActiveTab(0);
      setMode('detail');
    },
    [],
  );

  const renderSessionItem = useCallback(
    (session: TeamSessionSummary, _index: number, isSelected: boolean) => {
      const skill = inferSkill(session.sessionId);
      return (
        <Box gap={1}>
          <StatusDot status={session.status} colorMap={STATUS_COLORS} />
          <Text bold={isSelected} color={isSelected ? 'cyan' : undefined}>
            {session.title || session.sessionId}
          </Text>
          <Text dimColor>[{skill}]</Text>
          <ProgressBar
            completed={session.taskProgress.completed}
            total={session.taskProgress.total}
          />
          <Text dimColor>{session.duration}</Text>
        </Box>
      );
    },
    [],
  );

  // Loading state
  if (loading && !sessions) {
    return (
      <Box>
        <Text dimColor>Loading team sessions...</Text>
      </Box>
    );
  }

  // Error state
  if (error) {
    return (
      <Box>
        <Text color="red">Error: {error.message}</Text>
      </Box>
    );
  }

  // ---------- List mode ----------
  if (mode === 'list') {
    if (!sessions || sessions.length === 0) {
      return (
        <Box flexDirection="column" padding={1}>
          <Text bold color="cyan">Team Sessions</Text>
          <Text dimColor>No team sessions found.</Text>
        </Box>
      );
    }

    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">Team Sessions</Text>
          <Text dimColor> ({sessions.length})</Text>
        </Box>
        <ScrollableList
          items={sessions}
          renderItem={renderSessionItem}
          onSelect={handleSelectSession}
        />
      </Box>
    );
  }

  // ---------- Detail mode ----------
  if (!detail) {
    return (
      <Box>
        <Text dimColor>Loading session detail...</Text>
      </Box>
    );
  }

  const skill = inferSkill(detail.sessionId);

  let tabContent: React.ReactNode;
  switch (activeTab) {
    case 0:
      tabContent = <PipelineTab detail={detail} />;
      break;
    case 1:
      tabContent = <RolesTab detail={detail} />;
      break;
    case 2:
      tabContent = <MessagesTab detail={detail} />;
      break;
    case 3:
      tabContent = <FilesTab detail={detail} />;
      break;
    default:
      tabContent = <PipelineTab detail={detail} />;
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Header */}
      <Box gap={1} marginBottom={1}>
        <StatusDot status={detail.status} colorMap={STATUS_COLORS} />
        <Text bold color="cyan">{detail.title || detail.sessionId}</Text>
        <Text dimColor>[{skill}]</Text>
        <Text dimColor>| Esc=back</Text>
      </Box>

      {/* Summary row */}
      <Box gap={2} marginBottom={1}>
        <ProgressBar
          completed={detail.taskProgress.completed}
          total={detail.taskProgress.total}
        />
        <Text dimColor>Roles: {detail.roles.length}</Text>
        <Text dimColor>Messages: {detail.messageCount}</Text>
        <Text dimColor>{detail.duration}</Text>
      </Box>

      {/* Tab bar */}
      <Box marginBottom={1}>
        <FilterBar
          options={[...DETAIL_TABS]}
          activeIndex={activeTab}
          onSelect={setActiveTab}
        />
      </Box>

      {/* Tab content */}
      <Box flexDirection="column" flexGrow={1}>
        {tabContent}
      </Box>
    </Box>
  );
}
