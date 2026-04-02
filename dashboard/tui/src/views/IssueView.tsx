import React, { useState, useCallback, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { TextInput, Select } from '@inkjs/ui';
import {
  ScrollableList,
  SplitPane,
  FilterBar,
  StatusDot,
  ConfirmDialog,
} from '../components/index.js';
import { useApi, useBaseUrl } from '../providers/ApiProvider.js';
import type {
  Issue,
  IssueType,
  IssuePriority,
  CreateIssueRequest,
} from '@shared/issue-types.js';
import { ISSUE_API_ENDPOINTS } from '@shared/constants.js';

// ---------------------------------------------------------------------------
// Mode state machine
// ---------------------------------------------------------------------------

type Mode = 'list' | 'detail' | 'create' | 'edit' | 'delete-confirm' | 'search' | 'status-select';

// ---------------------------------------------------------------------------
// Filter options
// ---------------------------------------------------------------------------

const STATUS_FILTERS: string[] = [
  'All', 'open', 'registered', 'in_progress', 'resolved', 'closed', 'deferred',
];

const TYPE_FILTERS: string[] = ['All', 'bug', 'feature', 'improvement', 'task'];
const PRIORITY_FILTERS: string[] = ['All', 'low', 'medium', 'high', 'urgent'];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRIORITY_COLORS: Record<IssuePriority, string> = {
  urgent: 'red',
  high: 'yellow',
  medium: 'cyan',
  low: 'gray',
};

type CreateStep = 'title' | 'description' | 'type' | 'priority';
const CREATE_STEPS: CreateStep[] = ['title', 'description', 'type', 'priority'];

const TYPE_OPTIONS = [
  { label: 'Bug', value: 'bug' },
  { label: 'Feature', value: 'feature' },
  { label: 'Improvement', value: 'improvement' },
  { label: 'Task', value: 'task' },
];

const PRIORITY_OPTIONS = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: 'Urgent', value: 'urgent' },
];

const STATUS_OPTIONS = [
  { label: 'Open', value: 'open' },
  { label: 'Registered', value: 'registered' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'Closed', value: 'closed' },
  { label: 'Deferred', value: 'deferred' },
];

// ---------------------------------------------------------------------------
// IssueView
// ---------------------------------------------------------------------------

export function IssueView() {
  const [mode, setMode] = useState<Mode>('list');
  const [statusFilterIndex, setStatusFilterIndex] = useState(0);
  const [typeFilterIndex, setTypeFilterIndex] = useState(0);
  const [priorityFilterIndex, setPriorityFilterIndex] = useState(0);
  const [activeFilterRow, setActiveFilterRow] = useState(0); // 0=status, 1=type, 2=priority
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Create/Edit form state
  const [formStep, setFormStep] = useState<CreateStep>('title');
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formType, setFormType] = useState<IssueType>('bug');
  const [formError, setFormError] = useState('');

  const baseUrl = useBaseUrl();

  const { data: issues, loading, error, refetch } = useApi<Issue[]>(
    ISSUE_API_ENDPOINTS.ISSUES,
    { pollInterval: 5000 },
  );

  // Multi-filter + search
  const filteredIssues = useMemo(() => {
    if (!issues) return [];
    let result = issues;
    const statusFilter = STATUS_FILTERS[statusFilterIndex];
    if (statusFilter !== 'All') result = result.filter((i) => i.status === statusFilter);
    const typeFilter = TYPE_FILTERS[typeFilterIndex];
    if (typeFilter !== 'All') result = result.filter((i) => i.type === typeFilter);
    const prioFilter = PRIORITY_FILTERS[priorityFilterIndex];
    if (prioFilter !== 'All') result = result.filter((i) => i.priority === prioFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((i) => i.title.toLowerCase().includes(q));
    }
    return result;
  }, [issues, statusFilterIndex, typeFilterIndex, priorityFilterIndex, searchQuery]);

  const handleSelectIssue = useCallback((issue: Issue) => {
    setSelectedIssue(issue);
    setMode('detail');
  }, []);

  const resetForm = useCallback(() => {
    setFormStep('title');
    setFormTitle('');
    setFormDesc('');
    setFormType('bug');
    setFormError('');
  }, []);

  // Pre-populate edit form
  const startEdit = useCallback(() => {
    if (!selectedIssue) return;
    setFormTitle(selectedIssue.title);
    setFormDesc(selectedIssue.description);
    setFormType(selectedIssue.type);
    setFormStep('title');
    setFormError('');
    setMode('edit');
  }, [selectedIssue]);

  // Submit create
  const submitCreate = useCallback(async (priority: IssuePriority) => {
    const body: CreateIssueRequest = {
      title: formTitle, description: formDesc, type: formType, priority,
    };
    try {
      await fetch(`${baseUrl}${ISSUE_API_ENDPOINTS.ISSUES}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      resetForm();
      setMode('list');
      refetch();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create issue');
    }
  }, [baseUrl, formTitle, formDesc, formType, resetForm, refetch]);

  // Submit edit
  const submitEdit = useCallback(async (priority: IssuePriority) => {
    if (!selectedIssue) return;
    try {
      await fetch(`${baseUrl}${ISSUE_API_ENDPOINTS.ISSUES}/${selectedIssue.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: formTitle, description: formDesc, type: formType, priority }),
      });
      resetForm();
      setMode('list');
      setSelectedIssue(null);
      refetch();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update issue');
    }
  }, [baseUrl, selectedIssue, formTitle, formDesc, formType, resetForm, refetch]);

  // Update status
  const updateStatus = useCallback(async (status: string) => {
    if (!selectedIssue) return;
    try {
      await fetch(`${baseUrl}${ISSUE_API_ENDPOINTS.ISSUES}/${selectedIssue.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      setMode('detail');
      refetch();
    } catch {
      // Silently fail on status update
    }
  }, [baseUrl, selectedIssue, refetch]);

  // Delete issue
  const performDelete = useCallback(async () => {
    if (!selectedIssue) return;
    try {
      await fetch(`${baseUrl}${ISSUE_API_ENDPOINTS.ISSUES}/${selectedIssue.id}`, {
        method: 'DELETE',
      });
      setMode('list');
      setSelectedIssue(null);
      refetch();
    } catch {
      // Silently fail
    }
  }, [baseUrl, selectedIssue, refetch]);

  // Global key handler
  useInput(
    (input, key) => {
      if (key.escape) {
        if (mode === 'search') { setSearchQuery(''); setMode('list'); return; }
        if (mode === 'detail' || mode === 'status-select') { setMode('list'); setSelectedIssue(null); return; }
        if (mode === 'create' || mode === 'edit') { resetForm(); setMode(selectedIssue ? 'detail' : 'list'); return; }
        if (mode === 'delete-confirm') { setMode('detail'); return; }
        return;
      }

      if (mode === 'list') {
        if (input === 'c' && !key.ctrl) { resetForm(); setMode('create'); return; }
        if (input === '/') { setSearchQuery(''); setMode('search'); return; }
        if (input === 'f') { setActiveFilterRow((prev) => (prev + 1) % 3); return; }
      }

      if (mode === 'detail' && selectedIssue) {
        if (input === 's') { setMode('status-select'); return; }
        if (input === 'e') { startEdit(); return; }
        if (input === 'd') { setMode('delete-confirm'); return; }
      }
    },
    { isActive: mode !== 'search' && mode !== 'create' && mode !== 'edit' && mode !== 'status-select' },
  );

  // Search mode
  if (mode === 'search') {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">Search Issues</Text>
          <Text dimColor> Esc=clear</Text>
        </Box>
        <TextInput
          placeholder="Search by title..."
          defaultValue={searchQuery}
          onChange={setSearchQuery}
          onSubmit={() => setMode('list')}
        />
      </Box>
    );
  }

  // Status select mode
  if (mode === 'status-select' && selectedIssue) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">Change Status: {selectedIssue.title}</Text>
        <Box marginTop={1}>
          <Select
            options={STATUS_OPTIONS}
            defaultValue={selectedIssue.status}
            onChange={(value) => updateStatus(value)}
          />
        </Box>
      </Box>
    );
  }

  // Delete confirm mode
  if (mode === 'delete-confirm' && selectedIssue) {
    return (
      <ConfirmDialog
        message={`Delete "${selectedIssue.title}"?`}
        onConfirm={performDelete}
        onCancel={() => setMode('detail')}
      />
    );
  }

  // Detail mode
  if (mode === 'detail' && selectedIssue) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">Issue: {selectedIssue.id}</Text>
          <Text dimColor> Esc=back [s]tatus [e]dit [d]elete</Text>
        </Box>
        <SplitPane
          ratio={45}
          left={
            <Box flexDirection="column" paddingRight={1}>
              <Text bold>{selectedIssue.title}</Text>
              <Box marginTop={1} flexDirection="column">
                <Box gap={1}><Text dimColor>Type:</Text><Text>{selectedIssue.type}</Text></Box>
                <Box gap={1}><Text dimColor>Priority:</Text><Text color={PRIORITY_COLORS[selectedIssue.priority]}>{selectedIssue.priority}</Text></Box>
                <Box gap={1}><Text dimColor>Status:</Text><StatusDot status={selectedIssue.status} showLabel /></Box>
                <Box gap={1}><Text dimColor>Created:</Text><Text>{selectedIssue.created_at?.slice(0, 10) ?? '-'}</Text></Box>
                <Box gap={1}><Text dimColor>Updated:</Text><Text>{selectedIssue.updated_at?.slice(0, 10) ?? '-'}</Text></Box>
                {selectedIssue.executor && (
                  <Box gap={1}><Text dimColor>Executor:</Text><Text>{selectedIssue.executor}</Text></Box>
                )}
              </Box>
              <Box marginTop={1} flexDirection="column">
                <Text dimColor>Description:</Text>
                <Text>{selectedIssue.description}</Text>
              </Box>
            </Box>
          }
          right={
            <Box flexDirection="column" paddingLeft={1}>
              {selectedIssue.analysis ? (
                <Box flexDirection="column">
                  <Text bold color="magenta">Analysis</Text>
                  <Box gap={1}><Text dimColor>Root cause:</Text><Text>{selectedIssue.analysis.root_cause}</Text></Box>
                  <Box gap={1}><Text dimColor>Impact:</Text><Text>{selectedIssue.analysis.impact}</Text></Box>
                  <Box gap={1}><Text dimColor>Confidence:</Text><Text>{(selectedIssue.analysis.confidence * 100).toFixed(0)}%</Text></Box>
                  <Box gap={1}><Text dimColor>Approach:</Text><Text>{selectedIssue.analysis.suggested_approach}</Text></Box>
                  {selectedIssue.analysis.related_files.length > 0 && (
                    <Box flexDirection="column" marginTop={1}>
                      <Text dimColor>Related files:</Text>
                      {selectedIssue.analysis.related_files.map((f, i) => (
                        <Text key={i}>  {f}</Text>
                      ))}
                    </Box>
                  )}
                </Box>
              ) : (
                <Text dimColor>No analysis available</Text>
              )}
              {selectedIssue.solution ? (
                <Box flexDirection="column" marginTop={1}>
                  <Text bold color="green">Solution</Text>
                  {selectedIssue.solution.steps.map((s, i) => (
                    <Box key={i} gap={1}>
                      <Text dimColor>{i + 1}.</Text>
                      <Text>{s.description}</Text>
                      {s.target && <Text dimColor>({s.target})</Text>}
                    </Box>
                  ))}
                  {selectedIssue.solution.context && (
                    <Box marginTop={1}><Text dimColor>Context: {selectedIssue.solution.context}</Text></Box>
                  )}
                </Box>
              ) : (
                <Box marginTop={1}><Text dimColor>No solution planned</Text></Box>
              )}
            </Box>
          }
        />
      </Box>
    );
  }

  // Create / Edit mode
  if (mode === 'create' || mode === 'edit') {
    const isEdit = mode === 'edit';
    const stepIndex = CREATE_STEPS.indexOf(formStep);

    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">{isEdit ? 'Edit Issue' : 'Create Issue'}</Text>
          <Text dimColor> (Step {stepIndex + 1}/{CREATE_STEPS.length}) Esc=cancel</Text>
        </Box>

        <Box gap={1} marginBottom={1}>
          {CREATE_STEPS.map((s, i) => (
            <Text key={s} bold={s === formStep} color={i < stepIndex ? 'green' : s === formStep ? 'cyan' : 'gray'}>
              {i < stepIndex ? '[x]' : s === formStep ? '[>]' : '[ ]'} {s}
            </Text>
          ))}
        </Box>

        {formStep === 'title' && (
          <Box flexDirection="column">
            <Text>Title:</Text>
            <TextInput placeholder="Enter issue title..." defaultValue={formTitle} onChange={setFormTitle} onSubmit={() => setFormStep('description')} />
          </Box>
        )}
        {formStep === 'description' && (
          <Box flexDirection="column">
            <Text>Description:</Text>
            <TextInput placeholder="Enter issue description..." defaultValue={formDesc} onChange={setFormDesc} onSubmit={() => setFormStep('type')} />
          </Box>
        )}
        {formStep === 'type' && (
          <Box flexDirection="column">
            <Text>Type:</Text>
            <Select options={TYPE_OPTIONS} defaultValue={formType} onChange={(value) => { setFormType(value as IssueType); setFormStep('priority'); }} />
          </Box>
        )}
        {formStep === 'priority' && (
          <Box flexDirection="column">
            <Text>Priority:</Text>
            <Select options={PRIORITY_OPTIONS} defaultValue="medium" onChange={(value) => { isEdit ? submitEdit(value as IssuePriority) : submitCreate(value as IssuePriority); }} />
          </Box>
        )}

        {formError && <Box marginTop={1}><Text color="red">Error: {formError}</Text></Box>}

        {stepIndex > 0 && (
          <Box flexDirection="column" marginTop={1} borderStyle="single" paddingX={1}>
            <Text dimColor bold>Filled:</Text>
            {formTitle && <Text dimColor>  Title: {formTitle}</Text>}
            {formDesc && <Text dimColor>  Description: {formDesc.slice(0, 60)}{formDesc.length > 60 ? '...' : ''}</Text>}
            {stepIndex > 2 && <Text dimColor>  Type: {formType}</Text>}
          </Box>
        )}
      </Box>
    );
  }

  // List mode
  return (
    <ListMode
      issues={filteredIssues}
      loading={loading}
      error={error}
      statusFilterIndex={statusFilterIndex}
      typeFilterIndex={typeFilterIndex}
      priorityFilterIndex={priorityFilterIndex}
      activeFilterRow={activeFilterRow}
      onStatusFilterChange={setStatusFilterIndex}
      onTypeFilterChange={setTypeFilterIndex}
      onPriorityFilterChange={setPriorityFilterIndex}
      onSelect={handleSelectIssue}
      searchQuery={searchQuery}
    />
  );
}

// ---------------------------------------------------------------------------
// ListMode
// ---------------------------------------------------------------------------

interface ListModeProps {
  issues: Issue[];
  loading: boolean;
  error: Error | null;
  statusFilterIndex: number;
  typeFilterIndex: number;
  priorityFilterIndex: number;
  activeFilterRow: number;
  onStatusFilterChange: (index: number) => void;
  onTypeFilterChange: (index: number) => void;
  onPriorityFilterChange: (index: number) => void;
  onSelect: (issue: Issue) => void;
  searchQuery: string;
}

function ListMode({
  issues, loading, error,
  statusFilterIndex, typeFilterIndex, priorityFilterIndex, activeFilterRow,
  onStatusFilterChange, onTypeFilterChange, onPriorityFilterChange,
  onSelect, searchQuery,
}: ListModeProps) {
  const renderItem = useCallback(
    (issue: Issue, _index: number, isSelected: boolean) => (
      <Box gap={1}>
        <Text color={isSelected ? 'cyan' : 'gray'} dimColor={!isSelected}>
          {issue.id.slice(0, 8)}
        </Text>
        <StatusDot status={issue.status} showLabel={false} />
        <Text color={isSelected ? 'cyan' : undefined} wrap="truncate">
          {issue.title}
        </Text>
        <Text color={PRIORITY_COLORS[issue.priority]}>
          [{issue.priority}]
        </Text>
      </Box>
    ),
    [],
  );

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">Issues</Text>
        <Text color="red">Error: {error.message}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1} gap={2}>
        <Text bold color="cyan">Issues</Text>
        {loading && !issues.length && <Text dimColor>Loading...</Text>}
        <Text dimColor>({issues.length} shown) [c]reate [/]search [f]ilter-row [Tab]cycle</Text>
      </Box>
      {searchQuery && (
        <Box marginBottom={1}>
          <Text dimColor>Search: </Text>
          <Text color="yellow">{searchQuery}</Text>
        </Box>
      )}
      <Box flexDirection="column" gap={0}>
        <Box gap={1}>
          <Text dimColor bold={activeFilterRow === 0} color={activeFilterRow === 0 ? 'cyan' : undefined}>Status:</Text>
          <FilterBar options={STATUS_FILTERS} activeIndex={statusFilterIndex} onSelect={onStatusFilterChange} isFocused={activeFilterRow === 0} />
        </Box>
        <Box gap={1}>
          <Text dimColor bold={activeFilterRow === 1} color={activeFilterRow === 1 ? 'cyan' : undefined}>Type:</Text>
          <FilterBar options={TYPE_FILTERS} activeIndex={typeFilterIndex} onSelect={onTypeFilterChange} isFocused={activeFilterRow === 1} />
        </Box>
        <Box gap={1}>
          <Text dimColor bold={activeFilterRow === 2} color={activeFilterRow === 2 ? 'cyan' : undefined}>Priority:</Text>
          <FilterBar options={PRIORITY_FILTERS} activeIndex={priorityFilterIndex} onSelect={onPriorityFilterChange} isFocused={activeFilterRow === 2} />
        </Box>
      </Box>
      <Box marginTop={1} flexGrow={1} flexDirection="column">
        <ScrollableList
          items={issues}
          renderItem={renderItem}
          onSelect={onSelect}
        />
      </Box>
    </Box>
  );
}
