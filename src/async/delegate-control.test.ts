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
