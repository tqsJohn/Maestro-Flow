import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

process.env.MAESTRO_HOME = join(tmpdir(), 'maestro-e2e-delegate-tests');

import { DelegateBrokerClient } from './index.js';
import { DelegateChannelRelay } from '../mcp/delegate-channel-relay.js';
import { handleDelegateMessage, normalizeDelegateExecId, toSep1686Status } from './delegate-control.js';
import { evaluateDelegateNotifications } from '../hooks/delegate-monitor.js';
import { NOTIFY_PREFIX } from '../hooks/constants.js';
import { CliHistoryStore, type ExecutionMeta } from '../agents/cli-history-store.js';

describe('Delegate E2E: Full Lifecycle', () => {
  let tempDir: string;
  let statePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'maestro-e2e-lifecycle-'));
    statePath = join(tempDir, 'delegate-broker.json');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('full lifecycle: queued -> running -> completed with relay notifications and status queries', async () => {
    const broker = new DelegateBrokerClient({ statePath });
    const notifications: Array<{ method: string; params: { content: string; meta: Record<string, string> } }> = [];

    // Set up relay to poll broker and send notifications
    const relay = new DelegateChannelRelay({
      server: {
        async notification(message) {
          notifications.push(message);
        },
      },
      broker,
      sessionId: 'e2e-relay-session',
      pollIntervalMs: 20,
      statusThrottleMs: 0,
      snapshotThrottleMs: 0,
      now: () => '2026-04-10T00:00:00.000Z',
    });

    await relay.start();

    // Phase 1: Job queued
    broker.publishEvent({
      jobId: 'e2e-job-1',
      type: 'queued',
      status: 'queued',
      payload: { summary: 'Task queued for processing' },
      jobMetadata: { tool: 'gemini', mode: 'analysis', workDir: tempDir },
      now: '2026-04-10T00:00:01.000Z',
    });

    await delay(50);

    // Verify relay received queued notification
    const queuedNotif = notifications.find(n => n.params.meta.event_type === 'queued');
    assert.ok(queuedNotif, 'Relay should emit queued notification');
    assert.equal(queuedNotif.params.meta.job_id, 'e2e-job-1');
    assert.ok(queuedNotif.params.content.includes('QUEUED'));

    // Phase 2: Job running with snapshot
    broker.publishEvent({
      jobId: 'e2e-job-1',
      type: 'snapshot',
      status: 'running',
      snapshot: { phase: 'analyzing', progress: 50 },
      payload: { summary: 'Analyzing source files' },
      now: '2026-04-10T00:00:05.000Z',
    });

    await delay(50);

    // Query status via broker API (simulating delegate_status tool)
    const job = broker.getJob('e2e-job-1');
    assert.ok(job);
    assert.equal(job.status, 'running');
    assert.deepEqual(job.latestSnapshot, { phase: 'analyzing', progress: 50 });
    assert.equal(job.metadata?.tool, 'gemini');

    // Phase 3: Job completed
    broker.publishEvent({
      jobId: 'e2e-job-1',
      type: 'completed',
      status: 'completed',
      payload: { summary: 'Analysis complete — 3 issues found' },
      now: '2026-04-10T00:00:10.000Z',
    });

    await delay(50);

    // Verify completed notification
    const completedNotif = notifications.find(n => n.params.meta.event_type === 'completed');
    assert.ok(completedNotif, 'Relay should emit completed notification');
    assert.ok(completedNotif.params.content.includes('DONE'));

    // Query final state
    const finalJob = broker.getJob('e2e-job-1');
    assert.equal(finalJob?.status, 'completed');
    assert.equal(finalJob?.lastEventType, 'completed');

    // Verify all events recorded
    const events = broker.listJobEvents('e2e-job-1');
    assert.equal(events.length, 3);
    assert.equal(events[0].type, 'queued');
    assert.equal(events[1].type, 'snapshot');
    assert.equal(events[2].type, 'completed');

    relay.stop();
  });

  it('full lifecycle preserves SEP-1686 status mappings throughout', () => {
    const broker = new DelegateBrokerClient({ statePath });

    broker.publishEvent({
      jobId: 'sep-job',
      type: 'queued',
      status: 'queued',
      payload: { summary: 'queued' },
      now: '2026-04-10T00:00:00.000Z',
    });
    assert.equal(toSep1686Status(broker.getJob('sep-job')!.status), 'submitted');

    broker.publishEvent({
      jobId: 'sep-job',
      type: 'status_update',
      status: 'running',
      payload: { summary: 'running' },
      now: '2026-04-10T00:00:01.000Z',
    });
    assert.equal(toSep1686Status(broker.getJob('sep-job')!.status), 'working');

    broker.publishEvent({
      jobId: 'sep-job',
      type: 'completed',
      status: 'completed',
      payload: { summary: 'done' },
      now: '2026-04-10T00:00:02.000Z',
    });
    assert.equal(toSep1686Status(broker.getJob('sep-job')!.status), 'completed');
  });
});

describe('Delegate E2E: Message Queue Round-Trip', () => {
  let tempDir: string;
  let statePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'maestro-e2e-msgqueue-'));
    statePath = join(tempDir, 'delegate-broker.json');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('queue message -> verify via listMessages -> dispatch -> verify status transitions', () => {
    const broker = new DelegateBrokerClient({ statePath });

    // Create a running job
    broker.publishEvent({
      jobId: 'msg-job-1',
      type: 'status_update',
      status: 'running',
      payload: { summary: 'running' },
      jobMetadata: { tool: 'gemini', mode: 'write', workDir: tempDir },
      now: '2026-04-10T01:00:00.000Z',
    });

    // Queue a message with inject delivery
    const queued = broker.queueMessage({
      jobId: 'msg-job-1',
      message: 'Please focus on the auth module',
      delivery: 'inject',
      requestedBy: 'e2e-test',
      now: '2026-04-10T01:00:05.000Z',
    });

    assert.equal(queued.status, 'queued');
    assert.equal(queued.delivery, 'inject');
    assert.equal(queued.message, 'Please focus on the auth module');

    // Verify via listMessages
    const messages = broker.listMessages('msg-job-1');
    assert.equal(messages.length, 1);
    assert.equal(messages[0].messageId, queued.messageId);
    assert.equal(messages[0].status, 'queued');
    assert.equal(messages[0].requestedBy, 'e2e-test');

    // Simulate dispatch (agent poller picks up and dispatches)
    const dispatched = broker.updateMessage({
      jobId: 'msg-job-1',
      messageId: queued.messageId,
      status: 'dispatched',
      dispatchReason: 'injected',
      now: '2026-04-10T01:00:10.000Z',
    });

    assert.ok(dispatched);
    assert.equal(dispatched!.status, 'dispatched');
    assert.equal(dispatched!.dispatchReason, 'injected');

    // Verify message_dispatched event recorded
    const events = broker.listJobEvents('msg-job-1');
    const dispatchEvent = events.find(e => e.type === 'message_dispatched');
    assert.ok(dispatchEvent, 'Should record message_dispatched event');
  });

  it('queue message with after_complete delivery for running job stays queued', () => {
    const broker = new DelegateBrokerClient({ statePath });

    broker.publishEvent({
      jobId: 'msg-job-ac',
      type: 'status_update',
      status: 'running',
      payload: { summary: 'running' },
      jobMetadata: { tool: 'codex', mode: 'analysis', workDir: tempDir },
      now: '2026-04-10T02:00:00.000Z',
    });

    // Queue after_complete message while job is running
    const queued = broker.queueMessage({
      jobId: 'msg-job-ac',
      message: 'Now do refactoring after you finish',
      delivery: 'after_complete',
      requestedBy: 'e2e-test',
      now: '2026-04-10T02:00:01.000Z',
    });

    assert.equal(queued.delivery, 'after_complete');
    assert.equal(queued.status, 'queued');

    // Verify it remains queued (no dispatch since job still running)
    const messages = broker.listMessages('msg-job-ac');
    assert.equal(messages.length, 1);
    assert.equal(messages[0].status, 'queued');
  });

  it('handleDelegateMessage for running job queues inject message correctly', () => {
    const broker = new DelegateBrokerClient({ statePath });

    // Set up history store with meta
    const historyDir = join(tempDir, 'cli-history');
    mkdirSync(historyDir, { recursive: true });
    const meta: ExecutionMeta = {
      execId: 'hdm-job-1',
      tool: 'gemini',
      mode: 'write',
      prompt: 'Do some work',
      workDir: tempDir,
      startedAt: '2026-04-10T03:00:00.000Z',
    };
    writeFileSync(join(historyDir, 'hdm-job-1.meta.json'), JSON.stringify(meta), 'utf-8');

    // Create running job in broker
    broker.publishEvent({
      jobId: 'hdm-job-1',
      type: 'status_update',
      status: 'running',
      payload: { summary: 'working' },
      jobMetadata: { tool: 'gemini', mode: 'write', workDir: tempDir },
      now: '2026-04-10T03:00:01.000Z',
    });

    // Use handleDelegateMessage with mocked historyStore
    const mockHistoryStore = {
      loadMeta: (execId: string) => execId === 'hdm-job-1' ? meta : null,
      getOutput: () => null,
    } as unknown as CliHistoryStore;

    const result = handleDelegateMessage(
      {
        execId: 'hdm-job-1',
        message: 'Add error handling',
        delivery: 'inject',
        requestedBy: 'e2e-test',
      },
      {
        historyStore: mockHistoryStore,
        delegateBroker: broker,
        launchDetachedDelegate: () => { /* no-op for test */ },
      },
    );

    assert.equal(result.accepted, true);
    assert.equal(result.delivery, 'inject');
    assert.equal(result.immediateDispatch, false);
    assert.equal(result.previousStatus, 'running');
    assert.equal(result.queueDepth, 1);
  });
});

describe('Delegate E2E: Cancel Flow', () => {
  let tempDir: string;
  let statePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'maestro-e2e-cancel-'));
    statePath = join(tempDir, 'delegate-broker.json');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('running job -> cancel -> verify terminal state and cancel event', () => {
    const broker = new DelegateBrokerClient({ statePath });

    // Create a running job
    broker.publishEvent({
      jobId: 'cancel-job-1',
      type: 'queued',
      status: 'queued',
      payload: { summary: 'queued' },
      jobMetadata: { tool: 'codex', mode: 'write', workDir: tempDir },
      now: '2026-04-10T04:00:00.000Z',
    });
    broker.publishEvent({
      jobId: 'cancel-job-1',
      type: 'status_update',
      status: 'running',
      payload: { summary: 'implementing feature' },
      now: '2026-04-10T04:00:05.000Z',
    });

    // Verify running state
    const runningJob = broker.getJob('cancel-job-1');
    assert.equal(runningJob?.status, 'running');

    // Request cancellation
    const cancelledJob = broker.requestCancel({
      jobId: 'cancel-job-1',
      requestedBy: 'e2e-test:delegate_cancel',
      reason: 'User requested abort',
      now: '2026-04-10T04:00:10.000Z',
    });

    // Verify cancel_requested state (not yet terminal — waiting for worker ack)
    assert.equal(cancelledJob.status, 'running');
    assert.equal(cancelledJob.lastEventType, 'cancel_requested');
    assert.equal(cancelledJob.metadata?.cancelRequestedBy, 'e2e-test:delegate_cancel');
    assert.equal(cancelledJob.metadata?.cancelReason, 'User requested abort');

    // Verify cancel_requested event in tail
    const events = broker.listJobEvents('cancel-job-1');
    const cancelEvent = events.find(e => e.type === 'cancel_requested');
    assert.ok(cancelEvent, 'cancel_requested event should exist');

    // Simulate worker acknowledging cancellation
    broker.publishEvent({
      jobId: 'cancel-job-1',
      type: 'cancelled',
      status: 'cancelled',
      payload: { summary: 'Cancelled by user request' },
      now: '2026-04-10T04:00:15.000Z',
    });

    // Verify final terminal state
    const finalJob = broker.getJob('cancel-job-1');
    assert.equal(finalJob?.status, 'cancelled');
    assert.equal(finalJob?.lastEventType, 'cancelled');

    // Full event timeline
    const allEvents = broker.listJobEvents('cancel-job-1');
    assert.equal(allEvents.length, 4);
    assert.equal(allEvents[0].type, 'queued');
    assert.equal(allEvents[1].type, 'status_update');
    assert.equal(allEvents[2].type, 'cancel_requested');
    assert.equal(allEvents[3].type, 'cancelled');
  });

  it('cancel on already-terminal job returns existing state without adding events', () => {
    const broker = new DelegateBrokerClient({ statePath });

    broker.publishEvent({
      jobId: 'cancel-done-job',
      type: 'completed',
      status: 'completed',
      payload: { summary: 'already finished' },
      jobMetadata: { tool: 'gemini' },
      now: '2026-04-10T04:30:00.000Z',
    });

    const result = broker.requestCancel({
      jobId: 'cancel-done-job',
      requestedBy: 'e2e-test',
      reason: 'too late',
      now: '2026-04-10T04:30:05.000Z',
    });

    // Should return existing job unchanged
    assert.equal(result.status, 'completed');
    assert.equal(result.lastEventType, 'completed');

    // No cancel event added
    const events = broker.listJobEvents('cancel-done-job');
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'completed');
  });

  it('cancel flow with relay emits cancel notification', async () => {
    const broker = new DelegateBrokerClient({ statePath });
    const notifications: Array<{ method: string; params: { content: string; meta: Record<string, string> } }> = [];

    const relay = new DelegateChannelRelay({
      server: {
        async notification(message) {
          notifications.push(message);
        },
      },
      broker,
      sessionId: 'e2e-cancel-relay',
      pollIntervalMs: 20,
      statusThrottleMs: 0,
      snapshotThrottleMs: 0,
      now: () => '2026-04-10T05:00:00.000Z',
    });

    await relay.start();

    broker.publishEvent({
      jobId: 'cancel-relay-job',
      type: 'status_update',
      status: 'running',
      payload: { summary: 'working' },
      now: '2026-04-10T05:00:01.000Z',
    });

    await delay(50);

    broker.requestCancel({
      jobId: 'cancel-relay-job',
      requestedBy: 'e2e-test',
      now: '2026-04-10T05:00:05.000Z',
    });

    await delay(50);

    // Verify cancel_requested notification emitted
    const cancelNotif = notifications.find(n => n.params.meta.event_type === 'cancel_requested');
    assert.ok(cancelNotif, 'Relay should emit cancel_requested notification');
    assert.ok(cancelNotif.params.content.includes('CANCELLING'));

    broker.publishEvent({
      jobId: 'cancel-relay-job',
      type: 'cancelled',
      status: 'cancelled',
      payload: { summary: 'Cancelled' },
      now: '2026-04-10T05:00:10.000Z',
    });

    await delay(50);

    const cancelledNotif = notifications.find(n => n.params.meta.event_type === 'cancelled');
    assert.ok(cancelledNotif, 'Relay should emit cancelled notification');
    assert.ok(cancelledNotif.params.content.includes('CANCELLED'));

    relay.stop();
  });
});

describe('Delegate E2E: Monitor Hook Integration', () => {
  let tempDir: string;
  let notifyPath: string;
  const sessionId = 'e2e-monitor-session';

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'maestro-e2e-monitor-'));
    notifyPath = join(tmpdir(), `${NOTIFY_PREFIX}${sessionId}.jsonl`);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    try { rmSync(notifyPath); } catch { /* may not exist */ }
  });

  it('delegate completes -> notification file written -> hook reads unread entries', () => {
    // Simulate delegate completion writing notification file
    const entries = [
      {
        execId: 'e2e-monitor-exec-1',
        tool: 'gemini',
        mode: 'analysis',
        prompt: 'Analyze the auth module for security vulnerabilities',
        exitCode: 0,
        completedAt: '2026-04-10T06:00:10.000Z',
      },
    ];
    writeFileSync(notifyPath, entries.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf-8');

    // Hook evaluates notifications
    const result = evaluateDelegateNotifications({ session_id: sessionId });

    assert.ok(result, 'Should return hook output for unread entries');
    assert.equal(result!.hookSpecificOutput.hookEventName, 'PostToolUse');
    assert.ok(result!.hookSpecificOutput.additionalContext.includes('[DELEGATE done]'));
    assert.ok(result!.hookSpecificOutput.additionalContext.includes('e2e-monitor-exec-1'));
    assert.ok(result!.hookSpecificOutput.additionalContext.includes('gemini/analysis'));

    // Verify entries marked as read
    const afterContent = readFileSync(notifyPath, 'utf-8').trim();
    const afterEntries = afterContent.split('\n').map(l => JSON.parse(l));
    assert.equal(afterEntries[0].read, true);

    // Second call should return null (all read)
    const secondResult = evaluateDelegateNotifications({ session_id: sessionId });
    assert.equal(secondResult, null);
  });

  it('delegate fails -> notification shows exit code', () => {
    const entries = [
      {
        execId: 'e2e-monitor-fail-1',
        tool: 'codex',
        mode: 'write',
        prompt: 'Implement the payment gateway integration with Stripe',
        exitCode: 1,
        completedAt: '2026-04-10T06:10:00.000Z',
      },
    ];
    writeFileSync(notifyPath, entries.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf-8');

    const result = evaluateDelegateNotifications({ session_id: sessionId });

    assert.ok(result);
    assert.ok(result!.hookSpecificOutput.additionalContext.includes('[DELEGATE exit:1]'));
    assert.ok(result!.hookSpecificOutput.additionalContext.includes('e2e-monitor-fail-1'));
  });

  it('multiple unread notifications are all reported in a single hook call', () => {
    const entries = [
      {
        execId: 'e2e-multi-1',
        tool: 'gemini',
        mode: 'analysis',
        prompt: 'Review code quality',
        exitCode: 0,
        completedAt: '2026-04-10T06:20:00.000Z',
      },
      {
        execId: 'e2e-multi-2',
        tool: 'codex',
        mode: 'write',
        prompt: 'Fix the bug in parser',
        exitCode: 0,
        completedAt: '2026-04-10T06:20:05.000Z',
      },
    ];
    writeFileSync(notifyPath, entries.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf-8');

    const result = evaluateDelegateNotifications({ session_id: sessionId });

    assert.ok(result);
    assert.ok(result!.hookSpecificOutput.additionalContext.includes('e2e-multi-1'));
    assert.ok(result!.hookSpecificOutput.additionalContext.includes('e2e-multi-2'));
  });

  it('no session_id returns null', () => {
    const result = evaluateDelegateNotifications({});
    assert.equal(result, null);
  });

  it('no notification file returns null', () => {
    const result = evaluateDelegateNotifications({ session_id: 'nonexistent-session-xyz' });
    assert.equal(result, null);
  });
});
