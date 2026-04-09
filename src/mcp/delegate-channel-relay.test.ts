import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

process.env.MAESTRO_HOME = join(tmpdir(), 'maestro-async-delegate-tests');

import { DelegateBrokerClient } from '../async/index.js';
import { DelegateChannelRelay } from './delegate-channel-relay.js';

describe('DelegateChannelRelay', () => {
  let tempDir: string;
  let statePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'maestro-channel-relay-'));
    statePath = join(tempDir, 'delegate-broker.json');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('registers a relay session, emits concise channel notifications, and acks duplicate status events', async () => {
    const broker = new DelegateBrokerClient({ statePath });
    const notifications: Array<{ method: string; params: { content: string; meta: Record<string, string> } }> = [];

    const relay = new DelegateChannelRelay({
      server: {
        async notification(message) {
          notifications.push(message);
        },
      },
      broker,
      sessionId: 'relay-test',
      pollIntervalMs: 20,
      statusThrottleMs: 1_000,
      snapshotThrottleMs: 1_000,
    });

    broker.publishEvent({
      jobId: 'job-1',
      type: 'snapshot',
      status: 'running',
      snapshot: { phase: 'collect', progress: 10 },
      payload: { summary: 'collecting context' },
      now: '2026-04-07T01:00:00.000Z',
    });
    broker.publishEvent({
      jobId: 'job-1',
      type: 'snapshot',
      status: 'running',
      snapshot: { phase: 'collect', progress: 10 },
      payload: { summary: 'collecting context' },
      now: '2026-04-07T01:00:01.000Z',
    });
    broker.publishEvent({
      jobId: 'job-1',
      type: 'status_update',
      status: 'running',
      payload: { summary: 'still running' },
      now: '2026-04-07T01:00:02.000Z',
    });
    broker.publishEvent({
      jobId: 'job-1',
      type: 'status_update',
      status: 'running',
      payload: { summary: 'still running' },
      now: '2026-04-07T01:00:03.000Z',
    });
    broker.publishEvent({
      jobId: 'job-1',
      type: 'completed',
      status: 'completed',
      payload: {
        summary: 'done with final output that should stay behind delegate_output rather than flooding the channel',
      },
      now: '2026-04-07T01:00:04.000Z',
    });

    await relay.start();
    await delay(120);
    relay.stop();

    assert.equal(notifications.length, 3);
    assert.equal(notifications[0].method, 'notifications/claude/channel');
    assert.match(notifications[0].params.content, /delegate_status/);
    assert.match(notifications[1].params.content, /delegate_tail/);
    assert.match(notifications[2].params.content, /delegate_output/);

    for (const notification of notifications) {
      assert.ok(notification.params.content.length <= 240);
      assert.equal(notification.params.meta.job_id, 'job-1');
      assert.equal(notification.params.meta.exec_id, 'job-1');
    }

    const remaining = broker.pollEvents({ sessionId: 'relay-test' });
    assert.deepEqual(remaining, []);
  });

  it('includes exec_id alias in notification meta', async () => {
    const broker = new DelegateBrokerClient({ statePath });
    const notifications: Array<{ method: string; params: { content: string; meta: Record<string, string> } }> = [];

    const relay = new DelegateChannelRelay({
      server: {
        async notification(message) {
          notifications.push(message);
        },
      },
      broker,
      sessionId: 'relay-exec-id-test',
      pollIntervalMs: 20,
    });

    broker.publishEvent({
      jobId: 'job-42',
      type: 'completed',
      status: 'completed',
      payload: { summary: 'done' },
      now: '2026-04-07T02:00:00.000Z',
    });

    await relay.start();
    await delay(80);
    relay.stop();

    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].params.meta.job_id, 'job-42');
    assert.equal(notifications[0].params.meta.exec_id, 'job-42');
    assert.equal(notifications[0].params.meta.event_type, 'completed');
    assert.equal(notifications[0].params.meta.status, 'completed');
  });

  it('stops polling after 3 consecutive failures', async () => {
    let heartbeatCount = 0;
    let pollCount = 0;
    const failingBroker = {
      registerSession() { return {} as ReturnType<DelegateBrokerClient['registerSession']>; },
      heartbeat() {
        heartbeatCount++;
        // Succeed on first call (from start's initial pollOnce) then fail
        if (heartbeatCount > 1) {
          throw new Error('broker unavailable');
        }
      },
      pollEvents() { pollCount++; return []; },
      ack() { return 0; },
      getJob() { return null; },
      listJobEvents() { return []; },
      requestCancel() { return {} as ReturnType<DelegateBrokerClient['requestCancel']>; },
      queueMessage() { return {} as ReturnType<DelegateBrokerClient['queueMessage']>; },
      listMessages() { return []; },
      updateMessage() { return null; },
      checkTimeouts() { return []; },
    };

    const relay = new DelegateChannelRelay({
      server: { async notification() {} },
      broker: failingBroker,
      sessionId: 'relay-health-test',
      pollIntervalMs: 10,
    });

    await relay.start();  // First pollOnce succeeds
    await delay(200);     // Give time for interval polls to fail 3 times
    relay.stop();

    // heartbeat 1 = initial success, then 3+ failures before circuit breaker trips
    assert.ok(heartbeatCount >= 4, `Expected at least 4 heartbeat calls, got ${heartbeatCount}`);
    assert.equal(pollCount, 1, 'Only the initial successful poll should have proceeded');
  });
});
