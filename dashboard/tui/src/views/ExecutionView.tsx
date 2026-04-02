import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { ScrollableList, StatusDot, FilterBar, ConfirmDialog } from '../components/index.js';
import { useApi, useBaseUrl } from '../providers/ApiProvider.js';
import { useWsEvent, useWs } from '../providers/WsProvider.js';
import { ISSUE_API_ENDPOINTS, EXECUTION_API_ENDPOINTS } from '@shared/constants.js';
import type { SchedulerStatus, ExecutionSlot } from '@shared/execution-types.js';
import type { Issue } from '@shared/issue-types.js';
import { CommanderTab } from './execution/CommanderTab.js';
import { CoordinatorTab } from './execution/CoordinatorTab.js';
import { ScheduleTab } from './execution/ScheduleTab.js';
import { LearningTab } from './execution/LearningTab.js';
import { ExtensionsTab } from './execution/ExtensionsTab.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const TABS = ['Monitor', 'Commander', 'Coordinator', 'Schedule', 'Learning', 'Extensions'] as const;

// ---------------------------------------------------------------------------
// ElapsedTime
// ---------------------------------------------------------------------------

function ElapsedTime({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState('');
  const startRef = useRef(new Date(startedAt).getTime());

  useEffect(() => {
    startRef.current = new Date(startedAt).getTime();
    function update() {
      const diff = Math.floor((Date.now() - startRef.current) / 1000);
      const mins = Math.floor(diff / 60);
      const secs = diff % 60;
      setElapsed(`${mins}m ${secs.toString().padStart(2, '0')}s`);
    }
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  return <Text color="yellow">{elapsed}</Text>;
}

// ---------------------------------------------------------------------------
// ExecutionView
// ---------------------------------------------------------------------------

export function ExecutionView() {
  const [activeTab, setActiveTab] = useState(0);
  const [monitorMode, setMonitorMode] = useState<'monitor' | 'dispatch'>('monitor');
  const [dispatchConfirm, setDispatchConfirm] = useState<Issue | null>(null);
  const [dispatchResult, setDispatchResult] = useState<string | null>(null);
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set());
  const [batchConfirm, setBatchConfirm] = useState(false);
  const [highlightedIssue, setHighlightedIssue] = useState<Issue | null>(null);
  const baseUrl = useBaseUrl();
  const { send } = useWs();

  // WS-driven scheduler status
  const schedulerData = useWsEvent<SchedulerStatus>('execution:scheduler_status');
  const { data: restStatus } = useApi<SchedulerStatus>(
    EXECUTION_API_ENDPOINTS.STATUS,
    { pollInterval: 5000 },
  );
  const status = schedulerData ?? restStatus;

  // Issues for dispatch mode
  const { data: allIssues, loading: issuesLoading, refetch: refetchIssues } = useApi<Issue[]>(
    ISSUE_API_ENDPOINTS.ISSUES,
    { skip: activeTab !== 0 || monitorMode !== 'dispatch' },
  );

  const runningIds = new Set(status?.running.map((s) => s.issueId) ?? []);
  const queuedIds = new Set(status?.queued ?? []);
  const dispatchableIssues = (allIssues ?? []).filter(
    (issue) =>
      (issue.status === 'open' || issue.status === 'registered') &&
      !runningIds.has(issue.id) &&
      !queuedIds.has(issue.id),
  );

  // Input handling
  useInput((input, key) => {
    if (key.escape) {
      if (batchConfirm) { setBatchConfirm(false); return; }
      if (dispatchConfirm) { setDispatchConfirm(null); setDispatchResult(null); return; }
      if (monitorMode === 'dispatch') { setMonitorMode('monitor'); setDispatchResult(null); setBatchSelected(new Set()); return; }
    }

    // Tab-level: only handle when in Monitor tab's monitor sub-mode
    if (activeTab === 0 && monitorMode === 'monitor') {
      if (input === 'd') { setMonitorMode('dispatch'); setDispatchResult(null); refetchIssues(); return; }
      if (input === 't') {
        // Toggle supervisor
        const enabled = !(status?.enabled);
        fetch(`${baseUrl}${EXECUTION_API_ENDPOINTS.SUPERVISOR}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled }),
        }).catch(() => {});
        return;
      }
    }

    // Dispatch sub-mode: batch toggle
    if (activeTab === 0 && monitorMode === 'dispatch' && !dispatchConfirm && !batchConfirm) {
      if (input === ' ' && highlightedIssue) {
        toggleBatch(highlightedIssue);
        return;
      }
      if (input === 'b' && batchSelected.size > 0) { setBatchConfirm(true); return; }
    }

    if (dispatchConfirm && !dispatchResult && key.return) {
      performDispatch(dispatchConfirm);
      return;
    }
  });

  const performDispatch = useCallback(async (issue: Issue) => {
    try {
      const res = await fetch(`${baseUrl}${EXECUTION_API_ENDPOINTS.DISPATCH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueId: issue.id }),
      });
      if (!res.ok) {
        setDispatchResult(`Error: ${res.status} ${res.statusText}`);
      } else {
        setDispatchResult(`Dispatched: ${issue.id} - ${issue.title}`);
      }
    } catch (err: unknown) {
      setDispatchResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [baseUrl]);

  const performBatchDispatch = useCallback(async () => {
    try {
      const res = await fetch(`${baseUrl}${EXECUTION_API_ENDPOINTS.BATCH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueIds: Array.from(batchSelected) }),
      });
      if (!res.ok) {
        setDispatchResult(`Batch error: ${res.status}`);
      } else {
        setDispatchResult(`Batch dispatched: ${batchSelected.size} issues`);
      }
      setBatchSelected(new Set());
      setBatchConfirm(false);
    } catch (err: unknown) {
      setDispatchResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [baseUrl, batchSelected]);

  const handleSelectIssue = useCallback((issue: Issue) => {
    setDispatchConfirm(issue);
    setDispatchResult(null);
  }, []);

  const toggleBatch = useCallback((issue: Issue) => {
    setBatchSelected((prev) => {
      const next = new Set(prev);
      if (next.has(issue.id)) next.delete(issue.id);
      else next.add(issue.id);
      return next;
    });
  }, []);

  const renderDispatchItem = useCallback(
    (issue: Issue, _index: number, isSelected: boolean) => (
      <Box>
        <Text color={batchSelected.has(issue.id) ? 'green' : 'gray'}>
          {batchSelected.has(issue.id) ? '[x]' : '[ ]'}
        </Text>
        <StatusDot status={issue.status} />
        <Text color={isSelected ? 'cyan' : undefined}> {issue.id}</Text>
        <Text color={isSelected ? 'cyan' : 'white'}> {issue.title}</Text>
        <Text dimColor> [{issue.type}/{issue.priority}]</Text>
      </Box>
    ),
    [batchSelected],
  );

  // -------------------------------------------------------------------------
  // Tab content renderer
  // -------------------------------------------------------------------------

  let tabContent: React.ReactNode;

  if (activeTab === 0) {
    // Monitor tab (with dispatch sub-mode)
    if (monitorMode === 'dispatch') {
      // Batch confirm
      if (batchConfirm) {
        tabContent = (
          <ConfirmDialog
            message={`Dispatch ${batchSelected.size} issues in batch?`}
            onConfirm={performBatchDispatch}
            onCancel={() => setBatchConfirm(false)}
          />
        );
      } else if (dispatchConfirm) {
        if (dispatchResult) {
          tabContent = (
            <Box flexDirection="column" padding={1}>
              <Text bold color={dispatchResult.startsWith('Error') ? 'red' : 'green'}>{dispatchResult}</Text>
              <Box marginTop={1}><Text dimColor>Esc: back to list</Text></Box>
            </Box>
          );
        } else {
          tabContent = (
            <Box flexDirection="column" padding={1}>
              <Text bold color="cyan">Confirm Dispatch</Text>
              <Box marginTop={1} flexDirection="column">
                <Text>Issue: <Text bold>{dispatchConfirm.id}</Text></Text>
                <Text>Title: {dispatchConfirm.title}</Text>
                <Text>Type: {dispatchConfirm.type} | Priority: {dispatchConfirm.priority}</Text>
              </Box>
              <Box marginTop={1}><Text dimColor>Enter=confirm Esc=cancel</Text></Box>
            </Box>
          );
        }
      } else {
        tabContent = (
          <Box flexDirection="column" flexGrow={1}>
            <Box marginBottom={1}>
              <Text bold color="cyan">Dispatch Issue</Text>
              <Text dimColor> ({dispatchableIssues.length}) Esc=back Space=toggle [b]atch</Text>
            </Box>
            {issuesLoading && !allIssues ? (
              <Text dimColor>Loading issues...</Text>
            ) : dispatchableIssues.length === 0 ? (
              <Text dimColor>No dispatchable issues found.</Text>
            ) : (
              <ScrollableList
                items={dispatchableIssues}
                renderItem={renderDispatchItem}
                onSelect={handleSelectIssue}
                onHighlight={(item) => setHighlightedIssue(item)}
              />
            )}
            {batchSelected.size > 0 && (
              <Box marginTop={1}>
                <Text color="green">{batchSelected.size} selected for batch</Text>
              </Box>
            )}
          </Box>
        );
      }
    } else {
      // Monitor sub-mode
      const running = status?.running ?? [];
      const queueLength = status?.queued?.length ?? 0;
      const stats = status?.stats;

      tabContent = (
        <Box flexDirection="column" flexGrow={1}>
          <Box marginBottom={1} gap={2}>
            <Box><Text dimColor>Slots: </Text><Text color="green">{running.length}</Text></Box>
            <Box><Text dimColor>Queued: </Text><Text color="yellow">{queueLength}</Text></Box>
            {stats && (
              <>
                <Box><Text dimColor>Completed: </Text><Text color="green">{stats.totalCompleted}</Text></Box>
                <Box><Text dimColor>Failed: </Text><Text color="red">{stats.totalFailed}</Text></Box>
                <Box><Text dimColor>Total: </Text><Text>{stats.totalDispatched}</Text></Box>
              </>
            )}
          </Box>

          {running.length === 0 ? (
            <Text dimColor>No active execution slots.</Text>
          ) : (
            <Box flexDirection="column">
              <Box>
                <Box width={14} flexShrink={0}><Text bold underline>Executor</Text></Box>
                <Box width={12} flexShrink={0}><Text bold underline>Issue</Text></Box>
                <Box width={10} flexShrink={0}><Text bold underline>Elapsed</Text></Box>
                <Box flexShrink={0}><Text bold underline>Process</Text></Box>
              </Box>
              {running.map((slot: ExecutionSlot) => (
                <Box key={slot.processId}>
                  <Box width={14} flexShrink={0}>
                    <StatusDot status="in_progress" />
                    <Text> {slot.executor}</Text>
                  </Box>
                  <Box width={12} flexShrink={0}><Text>{slot.issueId}</Text></Box>
                  <Box width={10} flexShrink={0}><ElapsedTime startedAt={slot.startedAt} /></Box>
                  <Box flexShrink={0}><Text dimColor>{slot.processId.slice(0, 8)}</Text></Box>
                </Box>
              ))}
            </Box>
          )}

          <Box marginTop={1}>
            <Text dimColor>
              Scheduler: {status?.enabled ? 'enabled' : 'disabled'}
              {status?.isCommanderActive ? ' | Commander: active' : ''}
              {status?.lastTickAt ? ` | Last tick: ${new Date(status.lastTickAt).toLocaleTimeString()}` : ''}
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>d=dispatch t=toggle supervisor</Text>
          </Box>
        </Box>
      );
    }
  } else if (activeTab === 1) {
    tabContent = <CommanderTab />;
  } else if (activeTab === 2) {
    tabContent = <CoordinatorTab />;
  } else if (activeTab === 3) {
    tabContent = <ScheduleTab />;
  } else if (activeTab === 4) {
    tabContent = <LearningTab />;
  } else {
    tabContent = <ExtensionsTab />;
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Execution</Text>
      </Box>
      <Box marginBottom={1}>
        <FilterBar
          options={[...TABS]}
          activeIndex={activeTab}
          onSelect={setActiveTab}
        />
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        {tabContent}
      </Box>
    </Box>
  );
}
