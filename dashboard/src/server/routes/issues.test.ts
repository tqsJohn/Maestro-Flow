import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createIssueRoutes } from './issues.js';
import type { Issue } from '../../shared/issue-types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let testDir: string;
let app: ReturnType<typeof createIssueRoutes>;

const sampleIssue: Issue = {
  id: 'ISS-test-001',
  title: 'Test issue',
  description: 'A test issue',
  type: 'bug',
  priority: 'high',
  status: 'open',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

async function seedIssues(issues: Issue[]): Promise<void> {
  const dir = join(testDir, 'issues');
  await mkdir(dir, { recursive: true });
  const content = issues.map((i) => JSON.stringify(i)).join('\n') + '\n';
  await writeFile(join(dir, 'issues.jsonl'), content, 'utf-8');
}

beforeEach(async () => {
  testDir = join(tmpdir(), `issues-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  await mkdir(testDir, { recursive: true });
  app = createIssueRoutes(testDir);
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// GET /api/issues/:id
// ---------------------------------------------------------------------------

describe('GET /api/issues/:id', () => {
  it('returns issue by ID with 200', async () => {
    await seedIssues([sampleIssue]);
    const res = await app.request('/api/issues/ISS-test-001');
    expect(res.status).toBe(200);
    const body = await res.json() as Issue;
    expect(body.id).toBe('ISS-test-001');
    expect(body.title).toBe('Test issue');
  });

  it('returns 404 for non-existent ID', async () => {
    await seedIssues([sampleIssue]);
    const res = await app.request('/api/issues/ISS-nonexistent');
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('not found');
  });

  it('returns 200 with correct fields when issue has analysis', async () => {
    const issueWithAnalysis: Issue = {
      ...sampleIssue,
      analysis: {
        root_cause: 'Memory leak',
        impact: 'High',
        related_files: ['src/app.ts'],
        confidence: 0.9,
        suggested_approach: 'Fix cleanup',
        analyzed_at: '2026-01-01T00:00:00Z',
        analyzed_by: 'gemini',
      },
    };
    await seedIssues([issueWithAnalysis]);
    const res = await app.request('/api/issues/ISS-test-001');
    expect(res.status).toBe(200);
    const body = await res.json() as Issue;
    expect(body.analysis?.root_cause).toBe('Memory leak');
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/issues/:id/analysis
// ---------------------------------------------------------------------------

describe('PATCH /api/issues/:id/analysis', () => {
  const validAnalysis = {
    root_cause: 'Null pointer in handler',
    impact: 'Crashes on empty input',
    related_files: ['src/handler.ts', 'src/utils.ts'],
    confidence: 0.75,
    suggested_approach: 'Add null check',
    analyzed_at: '2026-01-02T00:00:00Z',
    analyzed_by: 'claude-code',
  };

  it('sets analysis on issue and returns 200', async () => {
    await seedIssues([sampleIssue]);
    const res = await app.request('/api/issues/ISS-test-001/analysis', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validAnalysis),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Issue;
    expect(body.analysis?.root_cause).toBe('Null pointer in handler');
    expect(body.analysis?.confidence).toBe(0.75);
  });

  it('returns 404 for non-existent issue', async () => {
    await seedIssues([sampleIssue]);
    const res = await app.request('/api/issues/ISS-missing/analysis', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validAnalysis),
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 when root_cause is missing', async () => {
    await seedIssues([sampleIssue]);
    const { root_cause, ...incomplete } = validAnalysis;
    const res = await app.request('/api/issues/ISS-test-001/analysis', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(incomplete),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('root_cause');
  });

  it('returns 400 when confidence is out of range', async () => {
    await seedIssues([sampleIssue]);
    const res = await app.request('/api/issues/ISS-test-001/analysis', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validAnalysis, confidence: 1.5 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('confidence');
  });

  it('persists analysis to JSONL', async () => {
    await seedIssues([sampleIssue]);
    await app.request('/api/issues/ISS-test-001/analysis', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validAnalysis),
    });
    // Re-read via GET to verify persistence
    const res = await app.request('/api/issues/ISS-test-001');
    const body = await res.json() as Issue;
    expect(body.analysis?.analyzed_by).toBe('claude-code');
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/issues/:id/solution
// ---------------------------------------------------------------------------

describe('PATCH /api/issues/:id/solution', () => {
  const validSolution = {
    steps: [
      { description: 'Add null check', target: 'handler.ts', verification: 'Unit test passes' },
      { description: 'Add test', target: 'handler.test.ts', verification: 'Coverage > 80%' },
    ],
    context: 'Handler module',
    planned_at: '2026-01-03T00:00:00Z',
    planned_by: 'gemini',
  };

  it('sets solution on issue and returns 200', async () => {
    await seedIssues([sampleIssue]);
    const res = await app.request('/api/issues/ISS-test-001/solution', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validSolution),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Issue;
    expect(body.solution?.steps).toHaveLength(2);
    expect(body.solution?.planned_by).toBe('gemini');
  });

  it('returns 404 for non-existent issue', async () => {
    await seedIssues([sampleIssue]);
    const res = await app.request('/api/issues/ISS-missing/solution', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validSolution),
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 when steps is empty', async () => {
    await seedIssues([sampleIssue]);
    const res = await app.request('/api/issues/ISS-test-001/solution', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validSolution, steps: [] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('steps');
  });

  it('returns 400 when planned_at is missing', async () => {
    await seedIssues([sampleIssue]);
    const { planned_at, ...incomplete } = validSolution;
    const res = await app.request('/api/issues/ISS-test-001/solution', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(incomplete),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('planned_at');
  });

  it('persists solution to JSONL', async () => {
    await seedIssues([sampleIssue]);
    await app.request('/api/issues/ISS-test-001/solution', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validSolution),
    });
    const res = await app.request('/api/issues/ISS-test-001');
    const body = await res.json() as Issue;
    expect(body.solution?.steps).toHaveLength(2);
    expect(body.solution?.context).toBe('Handler module');
  });
});
