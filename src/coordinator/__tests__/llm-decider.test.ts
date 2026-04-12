import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DefaultLLMDecider, parseDecision } from '../llm-decider.js';
import type { SpawnFn } from '../cli-executor.js';
import type { LLMDecisionRequest } from '../graph-types.js';

function makeSpawn(opts: {
  output?: string;
  throwErr?: Error;
  onCall?: (prompt: string) => void;
}): SpawnFn {
  return async ({ prompt }) => {
    opts.onCall?.(prompt);
    if (opts.throwErr) throw opts.throwErr;
    return {
      output: opts.output ?? '',
      success: true,
      execId: 'test-1',
      durationMs: 1,
    };
  };
}

function makeReq(overrides: Partial<LLMDecisionRequest> = {}): LLMDecisionRequest {
  return {
    node_id: 'pick',
    prompt: 'DECISION prompt body (assembled by walker, passed verbatim)',
    valid_targets: ['done', 'run', 'abort'],
    ...overrides,
  };
}

describe('DefaultLLMDecider', () => {
  it('returns parsed result on well-formed output', async () => {
    const decider = new DefaultLLMDecider(makeSpawn({
      output: 'DECISION: done\nREASONING: tests passed, proceed to done',
    }));
    const res = await decider.decide(makeReq());
    assert.deepStrictEqual(res, { target: 'done', reasoning: 'tests passed, proceed to done' });
  });

  it('returns null when target is not in valid_targets', async () => {
    const decider = new DefaultLLMDecider(makeSpawn({
      output: 'DECISION: nowhere\nREASONING: invented target',
    }));
    const res = await decider.decide(makeReq());
    assert.strictEqual(res, null);
  });

  it('returns null when output has no DECISION line', async () => {
    const decider = new DefaultLLMDecider(makeSpawn({
      output: 'the answer is run, probably',
    }));
    const res = await decider.decide(makeReq());
    assert.strictEqual(res, null);
  });

  it('returns null when spawnFn throws', async () => {
    const decider = new DefaultLLMDecider(makeSpawn({
      throwErr: new Error('network exploded'),
    }));
    const res = await decider.decide(makeReq());
    assert.strictEqual(res, null);
  });

  it('returns null when valid_targets is empty', async () => {
    let called = false;
    const decider = new DefaultLLMDecider(makeSpawn({
      output: 'DECISION: done\nREASONING: x',
      onCall: () => { called = true; },
    }));
    const res = await decider.decide(makeReq({ valid_targets: [] }));
    assert.strictEqual(res, null);
    assert.strictEqual(called, false, 'decider must short-circuit before spawning');
  });

  it('returns null when prompt is empty', async () => {
    let called = false;
    const decider = new DefaultLLMDecider(makeSpawn({
      output: 'DECISION: done\nREASONING: x',
      onCall: () => { called = true; },
    }));
    const res = await decider.decide(makeReq({ prompt: '   ' }));
    assert.strictEqual(res, null);
    assert.strictEqual(called, false, 'decider must short-circuit on empty prompt');
  });

  it('passes the walker-assembled prompt through to spawnFn verbatim', async () => {
    let captured = '';
    const decider = new DefaultLLMDecider(makeSpawn({
      output: 'DECISION: done\nREASONING: ok',
      onCall: (p) => { captured = p; },
    }));
    const customPrompt = 'CUSTOM ASSEMBLED PROMPT FROM WALKER\nvalid: done, run';
    await decider.decide(makeReq({ prompt: customPrompt }));
    assert.strictEqual(captured, customPrompt);
  });
});

describe('parseDecision', () => {
  it('accepts trailing punctuation on target', () => {
    const res = parseDecision('DECISION: done.\nREASONING: ship it', ['done', 'run']);
    assert.deepStrictEqual(res, { target: 'done', reasoning: 'ship it' });
  });

  it('returns reasoning as empty string when REASONING line absent', () => {
    const res = parseDecision('DECISION: run', ['done', 'run']);
    assert.deepStrictEqual(res, { target: 'run', reasoning: '' });
  });

  it('returns null for malformed input', () => {
    assert.strictEqual(parseDecision('{ not valid', ['a', 'b']), null);
  });

  it('returns null when target is not in the valid set', () => {
    assert.strictEqual(parseDecision('DECISION: ghost\nREASONING: x', ['a', 'b']), null);
  });
});
