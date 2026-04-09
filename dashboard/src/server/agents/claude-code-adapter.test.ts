import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { AgentConfig } from '../../shared/agent-types.js';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

// Capture spawn calls
const spawnMock = vi.fn();

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
}));

vi.mock('./env-file-loader.js', () => ({
  loadEnvFile: vi.fn(() => ({})),
}));

vi.mock('./env-cleanup.js', () => ({
  cleanSpawnEnv: vi.fn((overrides: Record<string, string>) => ({
    ...process.env,
    ...overrides,
  })),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { ClaudeCodeAdapter } from './claude-code-adapter.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FakeStdin {
  writable: boolean;
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
}

/** Create a fake ChildProcess with piped stdio streams */
function createFakeChild() {
  const child = new EventEmitter() as any;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = {
    writable: true,
    write: vi.fn(),
    end: vi.fn(),
  } as FakeStdin;
  child.pid = 12345;
  child.killed = false;
  child.kill = vi.fn();
  return child;
}

function baseConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    type: 'claude-code',
    prompt: 'Hello world',
    workDir: '/tmp/test',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ClaudeCodeAdapter', () => {
  let adapter: ClaudeCodeAdapter;
  let fakeChild: ReturnType<typeof createFakeChild>;

  beforeEach(() => {
    adapter = new ClaudeCodeAdapter();
    fakeChild = createFakeChild();
    spawnMock.mockReset();
    spawnMock.mockReturnValue(fakeChild);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // supportsInteractive
  // -----------------------------------------------------------------------

  it('supportsInteractive returns true', () => {
    expect(adapter.supportsInteractive()).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Default (non-interactive) spawn mode
  // -----------------------------------------------------------------------

  describe('default spawn mode (--print)', () => {
    it('uses --print flag and passes prompt as CLI argument', async () => {
      const config = baseConfig();
      await adapter.spawn(config);

      const spawnArgs = spawnMock.mock.calls[0];
      const cliArgs: string[] = spawnArgs[1];
      expect(cliArgs).toContain('--print');
      expect(cliArgs).toContain('--output-format=stream-json');
      expect(cliArgs).toContain('Hello world');
      expect(cliArgs).not.toContain('--input-format=stream-json');
    });

    it('closes stdin immediately', async () => {
      const config = baseConfig();
      await adapter.spawn(config);

      const stdin = fakeChild.stdin as FakeStdin;
      expect(stdin.end).toHaveBeenCalled();
      expect(stdin.write).not.toHaveBeenCalled();
    });

    it('returns AgentProcess with interactive=true', async () => {
      const config = baseConfig();
      const proc = await adapter.spawn(config);

      expect(proc.interactive).toBe(true);
      expect(proc.status).toBe('running');
      expect(proc.type).toBe('claude-code');
    });
  });

  // -----------------------------------------------------------------------
  // Interactive spawn mode
  // -----------------------------------------------------------------------

  describe('interactive spawn mode (--input-format=stream-json)', () => {
    it('uses --input-format=stream-json instead of --print', async () => {
      const config = baseConfig({ interactive: true, prompt: 'Interactive prompt' });
      await adapter.spawn(config);

      const spawnArgs = spawnMock.mock.calls[0];
      const cliArgs: string[] = spawnArgs[1];
      expect(cliArgs).toContain('--input-format=stream-json');
      expect(cliArgs).toContain('--output-format=stream-json');
      expect(cliArgs).not.toContain('--print');
      // Prompt should NOT be in CLI args (sent via stdin instead)
      expect(cliArgs).not.toContain('Interactive prompt');
    });

    it('sends initial prompt via stdin as user_message JSON', async () => {
      const config = baseConfig({ interactive: true, prompt: 'Test prompt' });
      await adapter.spawn(config);

      const stdin = fakeChild.stdin as FakeStdin;
      expect(stdin.write).toHaveBeenCalledTimes(1);

      const written = stdin.write.mock.calls[0][0] as string;
      const parsed = JSON.parse(written.trim());
      expect(parsed).toEqual({ type: 'user_message', content: 'Test prompt' });
    });

    it('does NOT close stdin', async () => {
      const config = baseConfig({ interactive: true });
      await adapter.spawn(config);

      const stdin = fakeChild.stdin as FakeStdin;
      expect(stdin.end).not.toHaveBeenCalled();
    });

    it('returns AgentProcess with interactive=true', async () => {
      const config = baseConfig({ interactive: true });
      const proc = await adapter.spawn(config);

      expect(proc.interactive).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // doSendMessage
  // -----------------------------------------------------------------------

  describe('sendMessage in interactive mode', () => {
    it('writes user_message JSON to stdin', async () => {
      const config = baseConfig({ interactive: true });
      const proc = await adapter.spawn(config);

      const stdin = fakeChild.stdin as FakeStdin;
      // Clear the initial prompt write
      stdin.write.mockClear();

      await adapter.sendMessage(proc.id, 'Follow-up message');

      expect(stdin.write).toHaveBeenCalledTimes(1);
      const written = stdin.write.mock.calls[0][0] as string;
      const parsed = JSON.parse(written.trim());
      expect(parsed).toEqual({ type: 'user_message', content: 'Follow-up message' });
    });
  });

  // -----------------------------------------------------------------------
  // interactive=false explicit
  // -----------------------------------------------------------------------

  it('interactive=false uses default --print mode', async () => {
    const config = baseConfig({ interactive: false });
    await adapter.spawn(config);

    const spawnArgs = spawnMock.mock.calls[0];
    const cliArgs: string[] = spawnArgs[1];
    expect(cliArgs).toContain('--print');
    expect(cliArgs).not.toContain('--input-format=stream-json');
  });
});
