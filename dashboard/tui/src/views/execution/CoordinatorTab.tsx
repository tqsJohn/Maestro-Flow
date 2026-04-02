import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { TextInput } from '@inkjs/ui';
import { ScrollableList, StatusDot } from '../../components/index.js';
import { useWsEvent, useWs } from '../../providers/WsProvider.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CoordinateStatus {
  status: string;
  sessionId?: string;
  message?: string;
}

interface CoordinateStep {
  sessionId: string;
  step: string;
  status: string;
  detail?: string;
}

interface ClarificationNeeded {
  sessionId: string;
  question: string;
}

// ---------------------------------------------------------------------------
// CoordinatorTab
// ---------------------------------------------------------------------------

export function CoordinatorTab() {
  const [subMode, setSubMode] = useState<'list' | 'input' | 'clarify'>('list');
  const [intentText, setIntentText] = useState('');
  const [clarifyText, setClarifyText] = useState('');
  const [steps, setSteps] = useState<CoordinateStep[]>([]);

  const { send } = useWs();
  const status = useWsEvent<CoordinateStatus>('coordinate:status');
  const stepEvt = useWsEvent<CoordinateStep>('coordinate:step');
  const clarification = useWsEvent<ClarificationNeeded>('coordinate:clarification_needed');

  // Accumulate steps
  React.useEffect(() => {
    if (stepEvt) {
      setSteps((prev) => {
        const exists = prev.find((s) => s.step === stepEvt.step && s.sessionId === stepEvt.sessionId);
        if (exists) return prev.map((s) => (s.step === stepEvt.step && s.sessionId === stepEvt.sessionId ? stepEvt : s));
        return [...prev, stepEvt];
      });
    }
  }, [stepEvt]);

  useInput((input, key) => {
    if (key.escape) {
      if (subMode === 'input' || subMode === 'clarify') { setSubMode('list'); return; }
    }
    if (subMode === 'list') {
      if (input === 'n') { setIntentText(''); setSubMode('input'); return; }
      if (input === 'x' && status?.sessionId) {
        send({ action: 'coordinate:stop' });
        return;
      }
    }
  }, { isActive: subMode === 'list' });

  const handleSubmitIntent = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    send({ action: 'coordinate:start', intent: trimmed });
    setIntentText('');
    setSteps([]);
    setSubMode('list');
  }, [send]);

  const handleSubmitClarify = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed || !status?.sessionId) return;
    send({ action: 'coordinate:clarify', sessionId: status.sessionId, response: trimmed });
    setClarifyText('');
    setSubMode('list');
  }, [send, status?.sessionId]);

  // Auto-show clarification
  React.useEffect(() => {
    if (clarification) setSubMode('clarify');
  }, [clarification]);

  const renderStep = useCallback(
    (step: CoordinateStep, _index: number, isSelected: boolean) => (
      <Box gap={1}>
        <StatusDot status={step.status} showLabel={false} />
        <Text color={isSelected ? 'cyan' : undefined}>{step.step}</Text>
        <Text dimColor>({step.status})</Text>
        {step.detail && <Text dimColor>{step.detail.slice(0, 40)}</Text>}
      </Box>
    ),
    [],
  );

  if (subMode === 'input') {
    return (
      <Box flexDirection="column">
        <Text bold dimColor>New Coordinate Session</Text>
        <Box marginTop={1}>
          <Text>Intent: </Text>
          <TextInput
            placeholder="Describe the coordination intent..."
            defaultValue={intentText}
            onChange={setIntentText}
            onSubmit={handleSubmitIntent}
          />
        </Box>
        <Text dimColor>Enter=start | Esc=cancel</Text>
      </Box>
    );
  }

  if (subMode === 'clarify' && clarification) {
    return (
      <Box flexDirection="column">
        <Text bold color="yellow">Clarification Needed</Text>
        <Text>{clarification.question}</Text>
        <Box marginTop={1}>
          <Text>Response: </Text>
          <TextInput
            placeholder="Answer..."
            defaultValue={clarifyText}
            onChange={setClarifyText}
            onSubmit={handleSubmitClarify}
          />
        </Box>
        <Text dimColor>Enter=send | Esc=cancel</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box gap={2}>
        <Text bold dimColor>Coordinator</Text>
        {status && (
          <>
            <StatusDot status={status.status} showLabel />
            {status.sessionId && <Text dimColor>({status.sessionId})</Text>}
          </>
        )}
      </Box>

      {status?.message && (
        <Box marginTop={1}>
          <Text dimColor>{status.message}</Text>
        </Box>
      )}

      <Box marginTop={1} flexDirection="column" flexGrow={1}>
        {steps.length === 0 ? (
          <Text dimColor>No coordinate steps yet.</Text>
        ) : (
          <ScrollableList
            items={steps}
            renderItem={renderStep}
            isFocused
          />
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>n=new session x=stop</Text>
      </Box>
    </Box>
  );
}
