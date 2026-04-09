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

describe('delegate-control streaming delivery', () => {
  it('queues streaming message without requesting cancellation for running process', () => {
    const deps = createMockDependencies({ jobStatus: 'running' });

    const input: DelegateMessageInput = {
      execId: 'test-exec',
      message: 'Streaming follow-up',
      delivery: 'streaming',
      requestedBy: 'user-1',
    };

    const result = handleDelegateMessage(input, deps);

    assert.equal(result.accepted, true);
    assert.equal(result.delivery, 'streaming');
    assert.equal(result.immediateDispatch, false);
    // No cancel should have been requested
    assert.equal(deps.cancelCalls.length, 0);
    // No detached launch should have occurred
    assert.equal(deps.launchCalls.length, 0);
  });

  it('requests cancellation for interrupt_resume delivery (existing behavior preserved)', () => {
    const deps = createMockDependencies({ jobStatus: 'running' });

    const input: DelegateMessageInput = {
      execId: 'test-exec',
      message: 'Interrupt follow-up',
      delivery: 'interrupt_resume',
      requestedBy: 'user-1',
    };

    const result = handleDelegateMessage(input, deps);

    assert.equal(result.accepted, true);
    assert.equal(result.delivery, 'interrupt_resume');
    // Cancel should have been requested for interrupt_resume
    assert.equal(deps.cancelCalls.length, 1);
  });

  it('immediately dispatches streaming message when process is in terminal state', () => {
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
      message: 'Post-completion streaming',
      delivery: 'streaming',
    };

    const result = handleDelegateMessage(input, deps);

    assert.equal(result.accepted, true);
    assert.equal(result.immediateDispatch, true);
    // Should have launched a detached delegate for terminal state
    assert.equal(deps.launchCalls.length, 1);
  });
});
