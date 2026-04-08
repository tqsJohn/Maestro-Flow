import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DelegateBrokerClient, FileDelegateBroker, SqliteDelegateBroker } from './index.js';

describe('Delegate broker', () => {
  let tempDir: string;
  let statePath: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'maestro-delegate-broker-'));
    statePath = join(tempDir, 'delegate-broker.json');
    dbPath = join(tempDir, 'delegate-broker.sqlite');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('registers sessions and updates heartbeat timestamps', () => {
    const client = new DelegateBrokerClient({ statePath });

    const registered = client.registerSession({
      sessionId: 'session-a',
      channelId: 'claude/channel',
      metadata: { source: 'test' },
      now: '2026-04-07T00:00:00.000Z',
    });

    assert.equal(registered.registeredAt, '2026-04-07T00:00:00.000Z');
    assert.equal(registered.lastSeenAt, '2026-04-07T00:00:00.000Z');
    assert.equal(registered.channelId, 'claude/channel');

    const heartbeated = client.heartbeat({
      sessionId: 'session-a',
      now: '2026-04-07T00:01:00.000Z',
    });

    assert.equal(heartbeated.registeredAt, '2026-04-07T00:00:00.000Z');
    assert.equal(heartbeated.lastSeenAt, '2026-04-07T00:01:00.000Z');
  });

  it('supports publish, poll, and ack lifecycle per session', () => {
    const client = new DelegateBrokerClient({ statePath });
    client.registerSession({ sessionId: 'session-a', now: '2026-04-07T00:00:00.000Z' });
    client.registerSession({ sessionId: 'session-b', now: '2026-04-07T00:00:00.000Z' });

    const first = client.publishEvent({
      jobId: 'job-1',
      type: 'snapshot',
      status: 'running',
      snapshot: { step: 'boot', progress: 10 },
      payload: { summary: 'started' },
      now: '2026-04-07T00:00:10.000Z',
    });
    const second = client.publishEvent({
      jobId: 'job-1',
      type: 'status_update',
      status: 'running',
      payload: { summary: 'still running' },
      now: '2026-04-07T00:00:20.000Z',
    });

    const polled = client.pollEvents({ sessionId: 'session-a' });
    assert.deepEqual(
      polled.map((event) => event.eventId),
      [first.eventId, second.eventId],
    );

    const ackedCount = client.ack({
      sessionId: 'session-a',
      eventIds: [first.eventId],
      now: '2026-04-07T00:00:21.000Z',
    });
    assert.equal(ackedCount, 1);

    const remainingForSessionA = client.pollEvents({ sessionId: 'session-a' });
    assert.deepEqual(remainingForSessionA.map((event) => event.eventId), [second.eventId]);

    const eventsForSessionB = client.pollEvents({ sessionId: 'session-b' });
    assert.deepEqual(
      eventsForSessionB.map((event) => event.eventId),
      [first.eventId, second.eventId],
    );
  });

  it('keeps latest job snapshot and persists state across broker instances', () => {
    const client = new DelegateBrokerClient({ statePath });
    client.registerSession({ sessionId: 'session-a', now: '2026-04-07T00:00:00.000Z' });

    client.publishEvent({
      jobId: 'job-1',
      type: 'snapshot',
      status: 'running',
      snapshot: { phase: 'collect', progress: 25 },
      payload: { summary: 'collecting context' },
      jobMetadata: { tool: 'codex', mode: 'write' },
      now: '2026-04-07T00:00:05.000Z',
    });
    client.publishEvent({
      jobId: 'job-1',
      type: 'completed',
      payload: { summary: 'done' },
      now: '2026-04-07T00:00:10.000Z',
    });

    const broker = new FileDelegateBroker({ statePath });
    const job = broker.getJob('job-1');

    assert.ok(job);
    assert.equal(job.status, 'completed');
    assert.equal(job.lastEventType, 'completed');
    assert.deepEqual(job.latestSnapshot, { phase: 'collect', progress: 25 });
    assert.deepEqual(job.metadata, { tool: 'codex', mode: 'write' });

    const events = broker.listJobEvents('job-1');
    assert.equal(events.length, 2);
    assert.equal(events[0].type, 'snapshot');
    assert.equal(events[1].type, 'completed');

    const repolled = client.pollEvents({
      sessionId: 'session-a',
      afterEventId: events[0].eventId,
    });
    assert.deepEqual(repolled.map((event) => event.type), ['completed']);
  });

  it('persists cancellation requests without overwriting existing job metadata', () => {
    const client = new DelegateBrokerClient({ statePath });
    client.publishEvent({
      jobId: 'job-cancel',
      type: 'queued',
      status: 'queued',
      payload: { summary: 'queued' },
      jobMetadata: { tool: 'codex', mode: 'analysis' },
      now: '2026-04-08T00:00:00.000Z',
    });

    const updated = client.requestCancel({
      jobId: 'job-cancel',
      requestedBy: 'test-suite',
      reason: 'No longer needed',
      now: '2026-04-08T00:00:05.000Z',
    });

    assert.equal(updated.status, 'queued');
    assert.equal(updated.lastEventType, 'cancel_requested');
    assert.equal(updated.metadata?.tool, 'codex');
    assert.equal(updated.metadata?.cancelRequestedBy, 'test-suite');
    assert.equal(updated.metadata?.cancelReason, 'No longer needed');

    const events = client.listJobEvents('job-cancel');
    assert.equal(events[1].type, 'cancel_requested');
  });

  it('queues and updates follow-up delegate messages in broker metadata', () => {
    const client = new DelegateBrokerClient({ statePath });
    client.publishEvent({
      jobId: 'job-message',
      type: 'status_update',
      status: 'running',
      payload: { summary: 'running' },
      jobMetadata: { tool: 'codex', mode: 'analysis' },
      now: '2026-04-08T01:00:00.000Z',
    });

    const queued = client.queueMessage({
      jobId: 'job-message',
      message: 'Resume with tighter scope',
      delivery: 'interrupt_resume',
      requestedBy: 'test-suite',
      now: '2026-04-08T01:00:05.000Z',
    });
    assert.equal(queued.delivery, 'interrupt_resume');
    assert.equal(queued.status, 'queued');

    const queuedMessages = client.listMessages('job-message');
    assert.equal(queuedMessages.length, 1);
    assert.equal(queuedMessages[0].requestedBy, 'test-suite');

    const dispatched = client.updateMessage({
      jobId: 'job-message',
      messageId: queued.messageId,
      status: 'dispatched',
      dispatchReason: 'cancelled',
      now: '2026-04-08T01:00:10.000Z',
    });
    assert.ok(dispatched);
    assert.equal(dispatched?.status, 'dispatched');
    assert.equal(dispatched?.dispatchReason, 'cancelled');

    const messagesAfterDispatch = client.listMessages('job-message');
    assert.equal(messagesAfterDispatch[0].status, 'dispatched');
    assert.equal(client.listJobEvents('job-message').at(-1)?.type, 'message_dispatched');
  });

  it('supports sqlite-backed persistence with WAL mode', () => {
    const broker = new SqliteDelegateBroker({ dbPath });
    const client = new DelegateBrokerClient({ broker });
    client.registerSession({ sessionId: 'sqlite-session', now: '2026-04-08T00:00:00.000Z' });
    client.publishEvent({
      jobId: 'sqlite-job',
      type: 'snapshot',
      status: 'running',
      snapshot: { phase: 'collect', progress: 40 },
      payload: { summary: 'collecting' },
      now: '2026-04-08T00:00:01.000Z',
    });
    client.requestCancel({
      jobId: 'sqlite-job',
      requestedBy: 'sqlite-test',
      now: '2026-04-08T00:00:02.000Z',
    });
    broker.close();

    const reopened = new SqliteDelegateBroker({ dbPath });
    const job = reopened.getJob('sqlite-job');
    assert.ok(job);
    assert.equal(job.lastEventType, 'cancel_requested');
    assert.equal(job.metadata?.cancelRequestedBy, 'sqlite-test');
    assert.equal(reopened.listJobEvents('sqlite-job').length, 2);
    reopened.close();
  });
});
