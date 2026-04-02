import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { TextInput, Select } from '@inkjs/ui';
import { ScrollableList, DataTable } from '../components/index.js';
import type { Column } from '../components/index.js';
import { useApi } from '../providers/ApiProvider.js';
import { useWsEvent, useWs } from '../providers/WsProvider.js';
import { RequirementBoard } from './requirement/RequirementBoard.js';
import type {
  ExpandedRequirement,
  ChecklistItem,
  ExpansionDepth,
  RequirementProgressPayload,
  RequirementExpandedPayload,
  RequirementCommittedPayload,
} from '@shared/requirement-types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Mode = 'history' | 'input' | 'expanding' | 'result' | 'refine' | 'commit' | 'edit-item' | 'board';
type ExpansionMethod = 'sdk' | 'cli';
type EditStep = 'title' | 'type' | 'priority';

const DEPTH_OPTIONS: ExpansionDepth[] = ['high-level', 'standard', 'atomic'];
const METHOD_OPTIONS: ExpansionMethod[] = ['sdk', 'cli'];

// ---------------------------------------------------------------------------
// Checklist columns
// ---------------------------------------------------------------------------

const CHECKLIST_COLUMNS: Column<ChecklistItem>[] = [
  { key: 'title', label: 'Title', width: 30 },
  { key: 'type', label: 'Type', width: 14 },
  { key: 'priority', label: 'Priority', width: 10 },
  { key: 'estimated_effort', label: 'Effort', width: 10 },
  {
    key: 'dependencies',
    label: 'Deps',
    width: 16,
    render: (value) => <Text dimColor>{(value as string[]).length > 0 ? (value as string[]).join(', ') : '-'}</Text>,
  },
];

// ---------------------------------------------------------------------------
// ProgressBar — simple percentage fill
// ---------------------------------------------------------------------------

function ProgressBar({ progress, width = 30 }: { progress: number; width?: number }) {
  const filled = Math.round((progress / 100) * width);
  const empty = width - filled;
  return (
    <Box>
      <Text color="green">{'#'.repeat(filled)}</Text>
      <Text dimColor>{'-'.repeat(empty)}</Text>
      <Text> {progress}%</Text>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// RequirementView
// ---------------------------------------------------------------------------

export function RequirementView() {
  const [mode, setMode] = useState<Mode>('history');
  const [inputText, setInputText] = useState('');
  const [depthIndex, setDepthIndex] = useState(1); // default 'standard'
  const [methodIndex, setMethodIndex] = useState(0); // default 'sdk'
  const [currentRequirementId, setCurrentRequirementId] = useState<string | null>(null);
  const [resultItems, setResultItems] = useState<ChecklistItem[]>([]);
  const [resultTitle, setResultTitle] = useState('');
  const [commitMode, setCommitMode] = useState<'issues' | 'coordinate'>('issues');
  const [commitResult, setCommitResult] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState(0);
  const [refineText, setRefineText] = useState('');
  const [continueFromId, setContinueFromId] = useState<string | null>(null);
  const [editStep, setEditStep] = useState<EditStep>('title');
  const [editTitle, setEditTitle] = useState('');
  const [editType, setEditType] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const { send } = useWs();

  // History: fetch past expansions
  const { data: history, loading: historyLoading, refetch: refetchHistory } = useApi<ExpandedRequirement[]>(
    '/api/requirements',
    { skip: mode !== 'history' },
  );

  // WS events
  const progressData = useWsEvent<RequirementProgressPayload>('requirement:progress');
  const expandedData = useWsEvent<RequirementExpandedPayload>('requirement:expanded');
  const committedData = useWsEvent<RequirementCommittedPayload>('requirement:committed');

  // Transition from expanding to result when expansion completes
  useEffect(() => {
    if (mode === 'expanding' && expandedData?.requirement) {
      const req = expandedData.requirement;
      // Accept if we're tracking this ID, or if ID was null (new expansion)
      if (!currentRequirementId || req.id === currentRequirementId) {
        setCurrentRequirementId(req.id);
        setResultItems(req.items);
        setResultTitle(req.title);
        setSelectedRow(0);
        setMode('result');
      }
    }
  }, [expandedData, mode, currentRequirementId]);

  // Handle commit result
  useEffect(() => {
    if (mode === 'commit' && committedData) {
      if (currentRequirementId && committedData.requirementId === currentRequirementId) {
        if (committedData.mode === 'issues' && committedData.issueIds) {
          setCommitResult(`Created ${committedData.issueIds.length} issue(s): ${committedData.issueIds.join(', ')}`);
        } else if (committedData.mode === 'coordinate' && committedData.coordinateSessionId) {
          setCommitResult(`Coordinate session started: ${committedData.coordinateSessionId}`);
        } else {
          setCommitResult('Committed successfully.');
        }
      }
    }
  }, [committedData, mode, currentRequirementId]);

  // Track requirement ID from expanded event
  useEffect(() => {
    if (expandedData?.requirement && !currentRequirementId) {
      setCurrentRequirementId(expandedData.requirement.id);
    }
  }, [expandedData, currentRequirementId]);

  // Input handling
  useInput((input, key) => {
    // Global: Escape goes back
    if (key.escape) {
      if (mode === 'input') {
        setMode('history');
        setInputText('');
        setContinueFromId(null);
        refetchHistory();
        return;
      }
      if (mode === 'result' || mode === 'commit') {
        setMode('history');
        setInputText('');
        setCommitResult(null);
        setContinueFromId(null);
        refetchHistory();
        return;
      }
      if (mode === 'refine' || mode === 'edit-item') {
        setMode('result');
        return;
      }
      if (mode === 'board') {
        setMode('result');
        return;
      }
    }

    if (mode === 'history') {
      if (input === 'n') {
        setContinueFromId(null);
        setMode('input');
        setInputText('');
        setDepthIndex(1);
        setMethodIndex(0);
        return;
      }
    }

    if (mode === 'input') {
      if (key.tab) {
        // Cycle through depth options, then toggle method on wrap-around
        if (depthIndex === DEPTH_OPTIONS.length - 1) {
          setDepthIndex(0);
          setMethodIndex((prev) => (prev + 1) % METHOD_OPTIONS.length);
        } else {
          setDepthIndex((prev) => prev + 1);
        }
        return;
      }
    }

    if (mode === 'result') {
      if (key.upArrow) {
        setSelectedRow((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedRow((prev) => Math.min(resultItems.length - 1, prev + 1));
        return;
      }
      // 'c' to commit
      if (input === 'c') {
        setCommitMode('issues');
        setCommitResult(null);
        setMode('commit');
        return;
      }
      // 'r' to refine (discuss / feedback)
      if (input === 'r') {
        setRefineText('');
        setMode('refine');
        return;
      }
      // 'e' to edit selected item inline
      if (input === 'e' && resultItems[selectedRow]) {
        const item = resultItems[selectedRow]!;
        setEditTitle(item.title);
        setEditType(item.type ?? '');
        setEditPriority(item.priority ?? '');
        setEditStep('title');
        setMode('edit-item');
        return;
      }
      // 'b' to board mode (post-commit tracking)
      if (input === 'b') {
        setMode('board');
        return;
      }
      // 'n' to continue planning (new expansion using current as context)
      if (input === 'n') {
        setContinueFromId(currentRequirementId);
        setMode('input');
        setInputText('');
        setDepthIndex(1);
        setMethodIndex(0);
        return;
      }
    }

    if (mode === 'commit' && !commitResult) {
      if (key.tab) {
        setCommitMode((prev) => (prev === 'issues' ? 'coordinate' : 'issues'));
        return;
      }
      if (key.return && currentRequirementId) {
        send({
          action: 'requirement:commit',
          requirementId: currentRequirementId,
          mode: commitMode,
        });
        return;
      }
    }
  });

  // Render callbacks
  const renderHistoryItem = useCallback(
    (item: ExpandedRequirement, _index: number, isSelected: boolean) => (
      <Box>
        <Text color={isSelected ? 'cyan' : statusColor(item.status)}>
          [{item.status}]
        </Text>
        <Text color={isSelected ? 'cyan' : undefined}> {item.title || item.userInput}</Text>
        <Text dimColor> ({item.items.length} items, {item.depth})</Text>
      </Box>
    ),
    [],
  );

  const handleSelectHistory = useCallback(
    (item: ExpandedRequirement) => {
      setCurrentRequirementId(item.id);
      setResultItems(item.items);
      setResultTitle(item.title);
      setSelectedRow(0);
      setMode('result');
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Render modes
  // -------------------------------------------------------------------------

  // History mode
  if (mode === 'history') {
    if (historyLoading && !history) {
      return (
        <Box flexDirection="column" padding={1}>
          <Text bold color="cyan">Requirements</Text>
          <Text dimColor>Loading history...</Text>
        </Box>
      );
    }

    const items = history ?? [];

    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">Requirements</Text>
          <Text dimColor> ({items.length} expansions) | </Text>
          <Text dimColor>n: new | q: quit</Text>
        </Box>
        <ScrollableList
          items={items}
          renderItem={renderHistoryItem}
          onSelect={handleSelectHistory}
        />
      </Box>
    );
  }

  // Input mode
  if (mode === 'input') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">
          {continueFromId ? 'Continue Planning' : 'New Requirement'}
        </Text>
        {continueFromId && (
          <Box marginTop={1}>
            <Text color="magenta">Continue from: </Text>
            <Text dimColor>{resultTitle || continueFromId}</Text>
          </Box>
        )}
        <Box marginTop={1}>
          <Text>Text: </Text>
          <TextInput
            placeholder={continueFromId ? 'Describe additional requirements...' : 'Enter requirement text...'}
            defaultValue={inputText}
            onChange={setInputText}
            onSubmit={(value) => {
              if (value.trim().length > 0) {
                send({
                  action: 'requirement:expand',
                  text: value.trim(),
                  depth: DEPTH_OPTIONS[depthIndex],
                  method: METHOD_OPTIONS[methodIndex],
                  ...(continueFromId ? { previousRequirementId: continueFromId } : {}),
                });
                setCurrentRequirementId(null);
                setContinueFromId(null);
                setMode('expanding');
              }
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text>Depth: </Text>
          {DEPTH_OPTIONS.map((d, i) => (
            <Text key={d} color={i === depthIndex ? 'cyan' : 'gray'}>
              {i === depthIndex ? `[${d}]` : ` ${d} `}
              {' '}
            </Text>
          ))}
          <Text>  Method: </Text>
          {METHOD_OPTIONS.map((m, i) => (
            <Text key={m} color={i === methodIndex ? 'green' : 'gray'}>
              {i === methodIndex ? `[${m.toUpperCase()}]` : ` ${m.toUpperCase()} `}
              {' '}
            </Text>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Tab: cycle depth/method | Enter: expand | Esc: cancel</Text>
        </Box>
      </Box>
    );
  }

  // Expanding mode
  if (mode === 'expanding') {
    const progress = progressData?.progress ?? 0;
    const stage = progressData?.stage ?? 'preparing';
    const message = progressData?.message ?? 'Starting expansion...';

    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">Expanding Requirement...</Text>
        <Box marginTop={1}>
          <Text>Stage: </Text>
          <Text color="yellow">{stage}</Text>
        </Box>
        <Box marginTop={1}>
          <ProgressBar progress={progress} width={40} />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>{message}</Text>
        </Box>
      </Box>
    );
  }

  // Result mode
  if (mode === 'result') {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">{resultTitle || 'Expansion Result'}</Text>
          <Text dimColor> ({resultItems.length} items)</Text>
        </Box>
        <DataTable
          columns={CHECKLIST_COLUMNS}
          data={resultItems}
          selectedIndex={selectedRow}
        />
        <Box marginTop={1}>
          <Text dimColor>Up/Down: navigate | e: edit | r: refine | n: continue | c: commit | b: board | Esc: back</Text>
        </Box>
      </Box>
    );
  }

  // Edit item mode
  if (mode === 'edit-item') {
    const EDIT_TYPE_OPTIONS = [
      { label: 'Bug', value: 'bug' },
      { label: 'Feature', value: 'feature' },
      { label: 'Improvement', value: 'improvement' },
      { label: 'Task', value: 'task' },
    ];
    const EDIT_PRIORITY_OPTIONS = [
      { label: 'Low', value: 'low' },
      { label: 'Medium', value: 'medium' },
      { label: 'High', value: 'high' },
      { label: 'Urgent', value: 'urgent' },
    ];

    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">Edit Item #{selectedRow + 1}</Text>

        {editStep === 'title' && (
          <Box flexDirection="column" marginTop={1}>
            <Text>Title:</Text>
            <TextInput
              placeholder="Edit title..."
              defaultValue={editTitle}
              onChange={setEditTitle}
              onSubmit={() => setEditStep('type')}
            />
          </Box>
        )}
        {editStep === 'type' && (
          <Box flexDirection="column" marginTop={1}>
            <Text>Type:</Text>
            <Select
              options={EDIT_TYPE_OPTIONS}
              defaultValue={editType || 'task'}
              onChange={(value) => { setEditType(value); setEditStep('priority'); }}
            />
          </Box>
        )}
        {editStep === 'priority' && (
          <Box flexDirection="column" marginTop={1}>
            <Text>Priority:</Text>
            <Select
              options={EDIT_PRIORITY_OPTIONS}
              defaultValue={editPriority || 'medium'}
              onChange={(value) => {
                setEditPriority(value);
                // Apply edit
                setResultItems((prev) =>
                  prev.map((item, i) =>
                    i === selectedRow
                      ? { ...item, title: editTitle, type: editType as any, priority: value as any }
                      : item,
                  ),
                );
                setMode('result');
              }}
            />
          </Box>
        )}
        <Box marginTop={1}>
          <Text dimColor>Esc=cancel</Text>
        </Box>
      </Box>
    );
  }

  // Board mode
  if (mode === 'board') {
    const boardItems = resultItems.map((item) => ({
      title: item.title,
      status: 'open',
      executor: undefined,
      issueId: undefined,
    }));
    return (
      <RequirementBoard
        items={boardItems}
        onBack={() => setMode('result')}
      />
    );
  }

  // Refine mode
  if (mode === 'refine') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="magenta">Refine Requirement</Text>
        <Box marginTop={1}>
          <Text dimColor>Current: </Text>
          <Text>{resultTitle}</Text>
          <Text dimColor> ({resultItems.length} items)</Text>
        </Box>
        <Box marginTop={1}>
          <Text>Feedback: </Text>
          <TextInput
            placeholder="Provide feedback to refine this expansion..."
            defaultValue={refineText}
            onChange={setRefineText}
            onSubmit={(value) => {
              if (value.trim().length > 0 && currentRequirementId) {
                send({
                  action: 'requirement:refine',
                  requirementId: currentRequirementId,
                  feedback: value.trim(),
                });
                setRefineText('');
                setMode('expanding');
              }
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Enter: send feedback | Esc: back to result</Text>
        </Box>
      </Box>
    );
  }

  // Commit mode
  if (mode === 'commit') {
    if (commitResult) {
      return (
        <Box flexDirection="column" padding={1}>
          <Text bold color="green">Commit Complete</Text>
          <Box marginTop={1}>
            <Text>{commitResult}</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Esc: back to history</Text>
          </Box>
        </Box>
      );
    }

    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">Commit Requirement</Text>
        <Box marginTop={1}>
          <Text>Mode: </Text>
          <Text color={commitMode === 'issues' ? 'cyan' : 'gray'}>
            {commitMode === 'issues' ? '[issues]' : ' issues '}
          </Text>
          <Text> </Text>
          <Text color={commitMode === 'coordinate' ? 'cyan' : 'gray'}>
            {commitMode === 'coordinate' ? '[coordinate]' : ' coordinate '}
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>
            {commitMode === 'issues'
              ? 'Creates individual issues from checklist items'
              : 'Starts a coordinate session to execute items'}
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Tab: toggle mode | Enter: confirm | Esc: cancel</Text>
        </Box>
      </Box>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusColor(status: string): string {
  switch (status) {
    case 'done': return 'green';
    case 'expanding': return 'yellow';
    case 'reviewing': return 'blue';
    case 'failed': return 'red';
    case 'committing': return 'magenta';
    default: return 'gray';
  }
}
