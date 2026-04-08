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
    }

    const remaining = broker.pollEvents({ sessionId: 'relay-test' });
    assert.deepEqual(remaining, []);
  });
});
