import React, { useState, useCallback, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { TextInput } from '@inkjs/ui';
import {
  ScrollableList,
  DataTable,
  SplitPane,
  StatusDot,
  type Column,
} from '../components/index.js';
import { useApi } from '../providers/ApiProvider.js';
import { useWs, useWsEvent } from '../providers/WsProvider.js';
import type { PhaseCard, TaskCard, TaskStatus } from '@shared/types.js';
import { API_ENDPOINTS } from '@shared/constants.js';

// ---------------------------------------------------------------------------
// Mode state machine
// ---------------------------------------------------------------------------

type Mode = 'phases' | 'tasks' | 'taskDetail' | 'phaseDetail' | 'coordinate';

// ---------------------------------------------------------------------------
// Task table columns
// ---------------------------------------------------------------------------

const TASK_COLUMNS: Column<TaskCard>[] = [
  { key: 'id', label: 'ID', width: 12 },
  { key: 'title', label: 'Title', width: 40 },
  {
    key: 'meta',
    label: 'Status',
    width: 14,
    render: (_value, row) => <StatusDot status={row.meta.status} showLabel />,
  },
  { key: 'action', label: 'Action', width: 16 },
];

// ---------------------------------------------------------------------------
// Coordinate status payload shape
// ---------------------------------------------------------------------------

interface CoordinateStatus {
  status: string;
  message?: string;
  sessionId?: string;
}

// ---------------------------------------------------------------------------
// WorkflowView
// ---------------------------------------------------------------------------

export function WorkflowView() {
  const [mode, setMode] = useState<Mode>('phases');
  const [selectedPhase, setSelectedPhase] = useState<PhaseCard | null>(null);
  const [selectedTaskIdx, setSelectedTaskIdx] = useState(0);
  const [commandInput, setCommandInput] = useState('');

  const { send } = useWs();

  // Fetch phases
  const { data: phases, loading, error } = useApi<PhaseCard[]>(
    API_ENDPOINTS.PHASES,
    { pollInterval: 5000 },
  );

  // Fetch tasks for selected phase
  const phaseNum = selectedPhase?.phase;
  const tasksEndpoint = phaseNum != null
    ? API_ENDPOINTS.PHASE_TASKS.replace(':n', String(phaseNum))
    : '/___noop___';
  const { data: tasks, loading: tasksLoading } = useApi<TaskCard[]>(
    tasksEndpoint,
    { skip: phaseNum == null, pollInterval: 5000 },
  );

  // Coordinate status from WebSocket
  const coordinateStatus = useWsEvent<CoordinateStatus>('coordinate:status');

  // Phase selection -> tasks mode
  const handleSelectPhase = useCallback((phase: PhaseCard) => {
    setSelectedPhase(phase);
    setSelectedTaskIdx(0);
    setMode('tasks');
  }, []);

  // Send coordinate command
  const handleSendCommand = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    send({ action: 'coordinate:start', intent: trimmed });
    setCommandInput('');
  }, [send]);

  // Get selected task
  const selectedTask = useMemo(() => {
    if (!tasks || selectedTaskIdx >= tasks.length) return null;
    return tasks[selectedTaskIdx] ?? null;
  }, [tasks, selectedTaskIdx]);

  // Global key handler
  useInput(
    (input, key) => {
      if (key.escape) {
        if (mode === 'coordinate') { setMode('tasks'); return; }
        if (mode === 'taskDetail') { setMode('tasks'); return; }
        if (mode === 'phaseDetail') { setMode('tasks'); return; }
        if (mode === 'tasks') { setMode('phases'); setSelectedPhase(null); return; }
        return;
      }

      if (mode === 'tasks') {
        if (input === 'x' && !key.ctrl) { setMode('coordinate'); return; }
        if (input === 'p') { setMode('phaseDetail'); return; }
        if (key.return && selectedTask) { setMode('taskDetail'); return; }
        if (key.upArrow && selectedTaskIdx > 0) { setSelectedTaskIdx(selectedTaskIdx - 1); return; }
        if (key.downArrow && tasks && selectedTaskIdx < tasks.length - 1) { setSelectedTaskIdx(selectedTaskIdx + 1); return; }
      }
    },
    { isActive: true },
  );

  // -------------------------------------------------------------------------
  // Task detail mode
  // -------------------------------------------------------------------------
  if (mode === 'taskDetail' && selectedTask) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">Task: {selectedTask.id}</Text>
          <Text dimColor> Esc=back</Text>
        </Box>
        <SplitPane
          ratio={50}
          left={
            <Box flexDirection="column" paddingRight={1}>
              <Text bold>{selectedTask.title}</Text>
              <Box marginTop={1} flexDirection="column">
                <Box gap={1}><Text dimColor>ID:</Text><Text>{selectedTask.id}</Text></Box>
                <Box gap={1}><Text dimColor>Action:</Text><Text>{selectedTask.action}</Text></Box>
                <Box gap={1}><Text dimColor>Status:</Text><StatusDot status={selectedTask.meta.status} showLabel /></Box>
              </Box>
            </Box>
          }
          right={
            <Box flexDirection="column" paddingLeft={1}>
              {selectedTask.description && (
                <Box flexDirection="column">
                  <Text bold dimColor>Description</Text>
                  <Text>{selectedTask.description}</Text>
                </Box>
              )}
              {selectedTask.files && selectedTask.files.length > 0 && (
                <Box flexDirection="column" marginTop={1}>
                  <Text bold dimColor>Files</Text>
                  {selectedTask.files.map((f: any, i: number) => (
                    <Box key={i} gap={1}>
                      <Text color={f.action === 'create' ? 'green' : f.action === 'modify' ? 'yellow' : 'red'}>
                        [{f.action}]
                      </Text>
                      <Text>{f.path}</Text>
                      {f.target && <Text dimColor>({f.target})</Text>}
                    </Box>
                  ))}
                </Box>
              )}
              {selectedTask.convergence?.criteria && selectedTask.convergence.criteria.length > 0 && (
                <Box flexDirection="column" marginTop={1}>
                  <Text bold dimColor>Convergence Criteria</Text>
                  {selectedTask.convergence.criteria.map((c: string, i: number) => (
                    <Text key={i} dimColor>  - {c}</Text>
                  ))}
                </Box>
              )}
            </Box>
          }
        />
      </Box>
    );
  }

  // -------------------------------------------------------------------------
  // Phase detail mode
  // -------------------------------------------------------------------------
  if (mode === 'phaseDetail' && selectedPhase) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">Phase {selectedPhase.phase}: {selectedPhase.title}</Text>
          <Text dimColor> Esc=back</Text>
        </Box>
        <Box flexDirection="column">
          <Box gap={1}><Text dimColor>Status:</Text><StatusDot status={selectedPhase.status} showLabel /></Box>
          <Box gap={1}>
            <Text dimColor>Progress:</Text>
            <Text>{selectedPhase.execution.tasks_completed}/{selectedPhase.execution.tasks_total} tasks</Text>
          </Box>
          {selectedPhase.goal && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold dimColor>Goal</Text>
              <Text>{selectedPhase.goal}</Text>
            </Box>
          )}
          {selectedPhase.success_criteria && selectedPhase.success_criteria.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold dimColor>Success Criteria</Text>
              {selectedPhase.success_criteria.map((c: string, i: number) => (
                <Text key={i}>  - {c}</Text>
              ))}
            </Box>
          )}
          {selectedPhase.requirements && selectedPhase.requirements.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold dimColor>Requirements</Text>
              {selectedPhase.requirements.map((r: string, i: number) => (
                <Text key={i}>  - {r}</Text>
              ))}
            </Box>
          )}
        </Box>
      </Box>
    );
  }

  // -------------------------------------------------------------------------
  // Coordinate mode
  // -------------------------------------------------------------------------
  if (mode === 'coordinate') {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">Coordinate</Text>
          {selectedPhase && <Text dimColor> ({selectedPhase.title})</Text>}
          <Text dimColor> | Esc=back</Text>
        </Box>
        <Box flexDirection="column" marginBottom={1} borderStyle="single" paddingX={1} paddingY={0}>
          <Text dimColor bold>Status</Text>
          {coordinateStatus ? (
            <Box flexDirection="column">
              <Box gap={1}>
                <Text dimColor>State:</Text>
                <Text color={coordinateStatus.status === 'running' ? 'yellow' : coordinateStatus.status === 'completed' ? 'green' : 'gray'}>
                  {coordinateStatus.status}
                </Text>
              </Box>
              {coordinateStatus.message && (
                <Box gap={1}><Text dimColor>Message:</Text><Text>{coordinateStatus.message}</Text></Box>
              )}
              {coordinateStatus.sessionId && (
                <Box gap={1}><Text dimColor>Session:</Text><Text>{coordinateStatus.sessionId}</Text></Box>
              )}
            </Box>
          ) : (
            <Text dimColor>No active coordinate session</Text>
          )}
        </Box>
        <Box flexDirection="column">
          <Text>Command:</Text>
          <TextInput placeholder="Enter coordinate command..." onSubmit={handleSendCommand} />
        </Box>
      </Box>
    );
  }

  // -------------------------------------------------------------------------
  // Tasks mode
  // -------------------------------------------------------------------------
  if (mode === 'tasks' && selectedPhase) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box marginBottom={1} gap={2}>
          <Text bold color="cyan">Phase {selectedPhase.phase}: {selectedPhase.title}</Text>
          <StatusDot status={selectedPhase.status} showLabel />
        </Box>
        <Box marginBottom={1}>
          <Text dimColor>Esc=back [x]coordinate [p]hase detail Enter=task detail</Text>
        </Box>
        {tasksLoading && !(tasks?.length) ? (
          <Text dimColor>Loading tasks...</Text>
        ) : (
          <DataTable
            columns={TASK_COLUMNS}
            data={tasks ?? []}
            selectedIndex={selectedTaskIdx}
          />
        )}
      </Box>
    );
  }

  // -------------------------------------------------------------------------
  // Phases mode (default)
  // -------------------------------------------------------------------------
  return (
    <PhasesMode
      phases={phases ?? []}
      loading={loading}
      error={error}
      onSelect={handleSelectPhase}
    />
  );
}

// ---------------------------------------------------------------------------
// PhasesMode
// ---------------------------------------------------------------------------

interface PhasesModeProps {
  phases: PhaseCard[];
  loading: boolean;
  error: Error | null;
  onSelect: (phase: PhaseCard) => void;
}

function PhasesMode({ phases, loading, error, onSelect }: PhasesModeProps) {
  const renderItem = useCallback(
    (phase: PhaseCard, _index: number, isSelected: boolean) => (
      <Box gap={1}>
        <Text color={isSelected ? 'cyan' : 'gray'} dimColor={!isSelected}>
          P{phase.phase}
        </Text>
        <StatusDot status={phase.status} showLabel={false} />
        <Text color={isSelected ? 'cyan' : undefined} wrap="truncate">
          {phase.title}
        </Text>
        <Text dimColor>
          [{phase.execution.tasks_completed}/{phase.execution.tasks_total}]
        </Text>
      </Box>
    ),
    [],
  );

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">Workflow Phases</Text>
        <Text color="red">Error: {error.message}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1} gap={2}>
        <Text bold color="cyan">Workflow Phases</Text>
        {loading && !phases.length && <Text dimColor>Loading...</Text>}
        <Text dimColor>({phases.length} phases) Enter=view tasks</Text>
      </Box>
      <ScrollableList
        items={phases}
        renderItem={renderItem}
        onSelect={onSelect}
      />
    </Box>
  );
}
