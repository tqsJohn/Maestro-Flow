import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CoordinateBrokerAdapter } from '../coordinate-broker-adapter.js';
import { FileDelegateBroker } from '../../async/delegate-broker.js';
import type { CoordinateEvent } from '../graph-types.js';

function makeBroker(tmpDir: string) {
  return new FileDelegateBroker({ statePath: join(tmpDir, 'broker.json') });
}

describe('CoordinateBrokerAdapter', () => {
  let tmpDir: string;
  const origError = console.error;
  const errorLog: string[] = [];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'maestro-adapter-'));
    errorLog.length = 0;
    console.error = (msg: unknown) => { errorLog.push(String(msg)); };
  });

  afterEach(() => {
    console.error = origError;
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('publishes events keyed by event.session_id', () => {
    const broker = makeBroker(tmpDir);
    const adapter = new CoordinateBrokerAdapter(broker);

    const event: CoordinateEvent = {
      type: 'walker:started',
      session_id: 'sid-a',
      graph_id: 'g',
      intent: 'test',
    };
    adapter.emit(event);

    const consumerId = 'consumer-1';
    broker.registerSession({ sessionId: consumerId });
    const events = broker.pollEvents({ sessionId: consumerId, jobId: 'sid-a' });
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, 'walker:started');
    assert.strictEqual((events[0].payload as { graph_id?: string }).graph_id, 'g');
    assert.strictEqual((events[0].payload as { intent?: string }).intent, 'test');
  });

  it('routes events to different jobIds based on their session_id', () => {
    const broker = makeBroker(tmpDir);
    const adapter = new CoordinateBrokerAdapter(broker);

    adapter.emit({ type: 'walker:started', session_id: 'sid-a', graph_id: 'g', intent: 'a' });
    adapter.emit({ type: 'walker:started', session_id: 'sid-b', graph_id: 'g', intent: 'b' });

    const consumerId = 'consumer-2';
    broker.registerSession({ sessionId: consumerId });
    const eventsA = broker.pollEvents({ sessionId: consumerId, jobId: 'sid-a' });
    assert.strictEqual(eventsA.length, 1);
    assert.strictEqual((eventsA[0].payload as { intent?: string }).intent, 'a');

    const eventsB = broker.pollEvents({ sessionId: consumerId, jobId: 'sid-b' });
    assert.strictEqual(eventsB.length, 1);
    assert.strictEqual((eventsB[0].payload as { intent?: string }).intent, 'b');
  });

  it('does not throw when broker.publishEvent throws', () => {
    const throwingBroker = {
      publishEvent() { throw new Error('broker down'); },
    } as unknown as FileDelegateBroker;
    const adapter = new CoordinateBrokerAdapter(throwingBroker);

    assert.doesNotThrow(() => {
      adapter.emit({ type: 'walker:started', session_id: 'sid-x', graph_id: 'g', intent: 't' });
    });
    assert.ok(errorLog.some(l => l.includes('publishEvent failed')));
  });

  it('silently skips events without a session_id', () => {
    let calls = 0;
    const countingBroker = {
      publishEvent() { calls++; return {}; },
    } as unknown as FileDelegateBroker;
    const adapter = new CoordinateBrokerAdapter(countingBroker);

    // Cast away type safety to simulate a malformed event
    adapter.emit({ type: 'walker:started' } as unknown as CoordinateEvent);
    assert.strictEqual(calls, 0);
  });

  it('preserves multiple events in order for the same session', () => {
    const broker = makeBroker(tmpDir);
    const adapter = new CoordinateBrokerAdapter(broker);

    adapter.emit({ type: 'walker:started', session_id: 'sid-c', graph_id: 'g', intent: 'i' });
    adapter.emit({ type: 'walker:node_enter', session_id: 'sid-c', node_id: 'run', node_type: 'command' });
    adapter.emit({ type: 'walker:node_exit', session_id: 'sid-c', node_id: 'run', outcome: 'success' });

    const consumerId = 'consumer-3';
    broker.registerSession({ sessionId: consumerId });
    const events = broker.pollEvents({ sessionId: consumerId, jobId: 'sid-c' });
    assert.strictEqual(events.length, 3);
    assert.deepStrictEqual(
      events.map(e => e.type),
      ['walker:started', 'walker:node_enter', 'walker:node_exit'],
    );
  });
});
