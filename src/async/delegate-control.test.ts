import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleDelegateMessage,
  type DelegateMessageInput,
  type DelegateMessageDependencies,
} from './delegate-control.js';
import type { DelegateQueuedMessage, DelegateMessageDelivery, DelegateMessageStatus } from './delegate-broker.js';
import type { ExecutionMeta } from '../agents/cli-history-store.js';

function createMockMeta(overrides: Partial<ExecutionMeta> = {}): ExecutionMeta {
  return {
    execId: 'test-exec',
    tool: 'codex',
    mode: 'analysis',
    prompt: 'test prompt',
    workDir: 'D:/maestro2',
    startedAt: '2026-04-09T10:00:00.000Z',
    ...overrides,
  };
}

function createMockDependencies(options: {
  meta?: ExecutionMeta | null;
  jobStatus?: string;
  jobMetadata?: Record<string, unknown>;
  queuedMessages?: DelegateQueuedMessage[];
  cancelRequested?: boolean;
} = {}): DelegateMessageDependencies & {
  cancelCalls: Array<Record<string, unknown>>;
  queuedResults: DelegateQueuedMessage[];
  launchCalls: Array<Record<string, unknown>>;
} {
  const cancelCalls: Array<Record<string, unknown>> = [];
  const queuedResults: DelegateQueuedMessage[] = [];
  const launchCalls: Array<Record<string, unknown>> = [];
  let messageCounter = 0;

  return {
    cancelCalls,
    queuedResults,
    launchCalls,
    historyStore: {
      loadMeta: () => options.meta ?? createMockMeta(),
      saveMeta: () => undefined,
      appendEntry: () => undefined,
      getOutput: () => '',
      buildSnapshot: () => ({}),
      listRecent: () => [],
      buildResumePrompt: () => '',
    } as unknown as import('../agents/cli-history-store.js').CliHistoryStore,
    delegateBroker: {
      registerSession: () => { throw new Error('not implemented'); },
      heartbeat: () => { throw new Error('not implemented'); },
      publishEvent: () => { throw new Error('not implemented'); },
      pollEvents: () => [],
      ack: () => 0,
      getJob: () => options.jobStatus ? {
        jobId: 'test-exec',
        status: options.jobStatus,
        createdAt: '2026-04-09T10:00:00.000Z',
        updatedAt: '2026-04-09T10:00:00.000Z',
        lastEventId: 1,
        lastEventType: 'status_update',
        latestSnapshot: null,
        metadata: options.jobMetadata ?? {
          tool: 'codex',
          mode: 'analysis',
          workDir: 'D:/maestro2',
        },
      } : null,
      listJobEvents: () => [],
      requestCancel: (input: Record<string, unknown>) => {
        cancelCalls.push(input);
        return {
          jobId: 'test-exec',
          status: 'running',
          createdAt: '2026-04-09T10:00:00.000Z',
          updatedAt: '2026-04-09T10:00:01.000Z',
          lastEventId: 2,
          lastEventType: 'cancel_requested',
          latestSnapshot: null,
          metadata: {
            ...(options.jobMetadata ?? {}),
            cancelRequestedAt: '2026-04-09T10:00:01.000Z',
          },
        };
      },
      queueMessage: (input: Record<string, unknown>) => {
        messageCounter++;
        const msg: DelegateQueuedMessage = {
          messageId: `msg-${messageCounter}`,
          createdAt: '2026-04-09T10:00:01.000Z',
          delivery: input.delivery as DelegateMessageDelivery,
          message: input.message as string,
          status: 'queued' as DelegateMessageStatus,
        };
        queuedResults.push(msg);
        return msg;
      },
      listMessages: () => [...queuedResults, ...(options.queuedMessages ?? [])],
      updateMessage: () => null,
    } as unknown as import('./delegate-broker.js').DelegateBrokerApi,
    launchDetachedDelegate: (request: Record<string, unknown>) => {
      launchCalls.push(request);
    },
  };
}

describe('normalizeDelegateExecId', () => {
  it('strips cli-history- prefix from exec ID', async () => {
    const { normalizeDelegateExecId } = await import('./delegate-control.js');
    assert.equal(normalizeDelegateExecId('cli-history-abc123'), 'abc123');
  });

  it('returns plain ID unchanged (no prefix)', async () => {
    const { normalizeDelegateExecId } = await import('./delegate-control.js');
    assert.equal(normalizeDelegateExecId('plain-exec-id'), 'plain-exec-id');
  });

  it('trims whitespace', async () => {
    const { normalizeDelegateExecId } = await import('./delegate-control.js');
    assert.equal(normalizeDelegateExecId('  cli-history-trimmed  '), 'trimmed');
  });
});

describe('toSep1686Status', () => {
  it('maps queued to submitted', async () => {
    const { toSep1686Status } = await import('./delegate-control.js');
    assert.equal(toSep1686Status('queued'), 'submitted');
  });

  it('maps running to working', async () => {
    const { toSep1686Status } = await import('./delegate-control.js');
    assert.equal(toSep1686Status('running'), 'working');
  });

  it('passes through other statuses unchanged', async () => {
    const { toSep1686Status } = await import('./delegate-control.js');
    assert.equal(toSep1686Status('completed'), 'completed');
    assert.equal(toSep1686Status('failed'), 'failed');
    assert.equal(toSep1686Status('input_required'), 'input_required');
    assert.equal(toSep1686Status('cancelled'), 'cancelled');
  });
});

describe('buildDelegateRequestFromState', () => {
  it('returns null when tool is missing', async () => {
    const { buildDelegateRequestFromState } = await import('./delegate-control.js');
    const result = buildDelegateRequestFromState(
      'exec-1', 'msg',
      { execId: 'exec-1', tool: '', mode: 'analysis', prompt: 'p', workDir: '/tmp', startedAt: '' } as any,
      null,
    );
    // tool is empty string which is falsy
    assert.equal(result, null);
  });

  it('returns null when mode is missing', async () => {
    const { buildDelegateRequestFromState } = await import('./delegate-control.js');
    const result = buildDelegateRequestFromState(
      'exec-1', 'msg',
      { execId: 'exec-1', tool: 'codex', mode: '' as any, prompt: 'p', workDir: '/tmp', startedAt: '' } as any,
      null,
    );
    assert.equal(result, null);
  });

  it('returns null when workDir is missing', async () => {
    const { buildDelegateRequestFromState } = await import('./delegate-control.js');
    const result = buildDelegateRequestFromState(
      'exec-1', 'msg',
      { execId: 'exec-1', tool: 'codex', mode: 'analysis', prompt: 'p', workDir: '', startedAt: '' } as any,
      null,
    );
    assert.equal(result, null);
  });

  it('reads from meta when available', async () => {
    const { buildDelegateRequestFromState } = await import('./delegate-control.js');
    const result = buildDelegateRequestFromState(
      'exec-1', 'new prompt',
      { execId: 'exec-1', tool: 'gemini', mode: 'write', prompt: 'p', workDir: '/project', startedAt: '', model: 'gemini-2' },
      { metadata: { tool: 'codex', mode: 'analysis', workDir: '/other' } },
    );
    assert.ok(result);
    assert.equal(result.tool, 'gemini');
    assert.equal(result.mode, 'write');
    assert.equal(result.workDir, '/project');
    assert.equal(result.model, 'gemini-2');
    assert.equal(result.prompt, 'new prompt');
  });

  it('falls back to job.metadata when meta fields missing', async () => {
    const { buildDelegateRequestFromState } = await import('./delegate-control.js');
    const result = buildDelegateRequestFromState(
      'exec-1', 'msg',
      null,
      { metadata: { tool: 'qwen', mode: 'write', workDir: '/fallback' } },
    );
    assert.ok(result);
    assert.equal(result.tool, 'qwen');
    assert.equal(result.mode, 'write');
    assert.equal(result.workDir, '/fallback');
  });
});

describe('delegate-control inject delivery', () => {
  it('queues inject message without requesting cancellation for running process', () => {
    const deps = createMockDependencies({ jobStatus: 'running' });

    const input: DelegateMessageInput = {
      execId: 'test-exec',
      message: 'Inject follow-up',
      delivery: 'inject',
      requestedBy: 'user-1',
    };

    const result = handleDelegateMessage(input, deps);

    assert.equal(result.accepted, true);
    assert.equal(result.delivery, 'inject');
    assert.equal(result.immediateDispatch, false);
    // Inject just queues — poller decides routing based on adapter capabilities
    assert.equal(deps.cancelCalls.length, 0);
    assert.equal(deps.launchCalls.length, 0);
  });

  it('treats legacy streaming/interrupt_resume as inject', () => {
    const deps = createMockDependencies({ jobStatus: 'running' });

    // Legacy 'streaming' value should be accepted and treated as inject
    const input: DelegateMessageInput = {
      execId: 'test-exec',
      message: 'Legacy streaming follow-up',
      delivery: 'streaming' as DelegateMessageDelivery,
      requestedBy: 'user-1',
    };

    const result = handleDelegateMessage(input, deps);

    assert.equal(result.accepted, true);
    assert.equal(result.immediateDispatch, false);
    // No cancel — inject just queues for poller
    assert.equal(deps.cancelCalls.length, 0);
    assert.equal(deps.launchCalls.length, 0);
  });

  it('immediately dispatches inject message when process is in terminal state', () => {
    const deps = createMockDependencies({
      jobStatus: 'completed',
      meta: createMockMeta({ completedAt: '2026-04-09T10:00:05.000Z', exitCode: 0 }),
      jobMetadata: {
        tool: 'codex',
        mode: 'analysis',
        workDir: 'D:/maestro2',
      },
    });

    const input: DelegateMessageInput = {
      execId: 'test-exec',
      message: 'Post-completion inject',
      delivery: 'inject',
    };

    const result = handleDelegateMessage(input, deps);

    assert.equal(result.accepted, true);
    assert.equal(result.immediateDispatch, true);
    // Should have launched a detached delegate for terminal state
    assert.equal(deps.launchCalls.length, 1);
  });
});

describe('delegate-control error cases', () => {
  it('throws on empty execId', () => {
    const deps = createMockDependencies({ jobStatus: 'running' });
    const input: DelegateMessageInput = {
      execId: '  ',
      message: 'hello',
      delivery: 'inject',
    };
    assert.throws(() => handleDelegateMessage(input, deps), /execId is required/);
  });

  it('throws on empty message', () => {
    const deps = createMockDependencies({ jobStatus: 'running' });
    const input: DelegateMessageInput = {
      execId: 'test-exec',
      message: '   ',
      delivery: 'inject',
    };
    assert.throws(() => handleDelegateMessage(input, deps), /message is required/);
  });

  it('throws when neither meta nor job found', () => {
    // Override loadMeta to return null (the ?? operator in mock converts null to default)
    const deps = createMockDependencies({ jobStatus: undefined });
    deps.historyStore = {
      ...deps.historyStore,
      loadMeta: () => null as any,
    } as any;
    const input: DelegateMessageInput = {
      execId: 'missing-exec',
      message: 'hello',
      delivery: 'inject',
    };
    assert.throws(() => handleDelegateMessage(input, deps), /not found/);
  });

  it('throws when job not found but meta exists', () => {
    // meta exists but getJob returns null
    const deps = createMockDependencies({ meta: createMockMeta(), jobStatus: undefined });
    const input: DelegateMessageInput = {
      execId: 'test-exec',
      message: 'hello',
      delivery: 'inject',
    };
    assert.throws(() => handleDelegateMessage(input, deps), /broker state unavailable/);
  });

  it('drops message when request cannot be built for terminal job', () => {
    // Terminal job with no usable metadata for rebuilding request
    // meta has no tool/mode/workDir either, so buildDelegateRequestFromState returns null
    const deps = createMockDependencies({
      jobStatus: 'completed',
      jobMetadata: {}, // No tool/mode/workDir in job metadata
    });
    deps.historyStore = {
      ...deps.historyStore,
      loadMeta: () => ({ execId: 'test-exec', tool: '', mode: '', prompt: '', workDir: '', startedAt: '' } as any),
    } as any;
    const input: DelegateMessageInput = {
      execId: 'test-exec',
      message: 'follow up',
      delivery: 'inject',
    };
    assert.throws(() => handleDelegateMessage(input, deps), /Unable to reconstruct/);
  });
});

describe('delegate-control after_complete delivery', () => {
  it('queues after_complete message for running job without immediate dispatch', () => {
    const deps = createMockDependencies({ jobStatus: 'running' });
    const input: DelegateMessageInput = {
      execId: 'test-exec',
      message: 'After completion follow-up',
      delivery: 'after_complete',
      requestedBy: 'user-1',
    };

    const result = handleDelegateMessage(input, deps);

    assert.equal(result.accepted, true);
    assert.equal(result.delivery, 'after_complete');
    // after_complete for running job just queues — no cancel, no launch
    assert.equal(deps.cancelCalls.length, 0);
    assert.equal(deps.launchCalls.length, 0);
    assert.equal(result.immediateDispatch, false);
  });
});
