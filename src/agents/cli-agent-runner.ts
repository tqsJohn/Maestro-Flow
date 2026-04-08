// ---------------------------------------------------------------------------
// CLI Agent Runner
// Orchestrates adapter selection, process spawning, stdout rendering, and
// exit handling for the `maestro cli` command.
// ---------------------------------------------------------------------------

import { resolve, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DashboardBridge } from './dashboard-bridge.js';
import { CliHistoryStore, type EntryLike } from './cli-history-store.js';
import { loadTemplate, loadProtocol } from '../config/template-discovery.js';
import { NOTIFY_PREFIX } from '../hooks/constants.js';
import { DelegateBrokerClient, type DelegateBrokerApi, type JsonObject } from '../async/index.js';

// ---------------------------------------------------------------------------
// Re-declare minimal types locally to avoid cross-rootDir imports from
// dashboard/src/shared/agent-types.ts. These mirror the canonical types.
// ---------------------------------------------------------------------------

type AgentType = 'claude-code' | 'codex' | 'gemini' | 'qwen' | 'opencode';

type AgentProcessStatus =
  | 'spawning'
  | 'running'
  | 'paused'
  | 'stopping'
  | 'stopped'
  | 'error';

interface AgentConfig {
  type: AgentType;
  prompt: string;
  workDir: string;
  env?: Record<string, string>;
  model?: string;
  approvalMode?: 'suggest' | 'auto';
}

interface AgentProcess {
  id: string;
  type: AgentType;
  status: AgentProcessStatus;
  config: AgentConfig;
  startedAt: string;
  pid?: number;
}

interface NormalizedEntryBase {
  id: string;
  processId: string;
  timestamp: string;
}

type NormalizedEntry =
  | (NormalizedEntryBase & { type: 'user_message'; content: string })
  | (NormalizedEntryBase & { type: 'assistant_message'; content: string; partial: boolean })
  | (NormalizedEntryBase & { type: 'thinking'; content: string })
  | (NormalizedEntryBase & { type: 'tool_use'; name: string; input: Record<string, unknown>; status: string; result?: string })
  | (NormalizedEntryBase & { type: 'file_change'; path: string; action: string; diff?: string })
  | (NormalizedEntryBase & { type: 'command_exec'; command: string; exitCode?: number; output?: string })
  | (NormalizedEntryBase & { type: 'approval_request'; toolName: string; toolInput: Record<string, unknown>; requestId: string })
  | (NormalizedEntryBase & { type: 'approval_response'; requestId: string; allowed: boolean })
  | (NormalizedEntryBase & { type: 'error'; message: string; code?: string })
  | (NormalizedEntryBase & { type: 'status_change'; status: AgentProcessStatus; reason?: string })
  | (NormalizedEntryBase & { type: 'token_usage'; inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number });

/** Minimal adapter interface matching BaseAgentAdapter's public surface */
interface AdapterLike {
  spawn(config: AgentConfig): Promise<AgentProcess>;
  stop(processId: string): Promise<void>;
  onEntry(processId: string, cb: (entry: NormalizedEntry) => void): () => void;
}

interface DashboardBridgeLike {
  tryConnect(url: string, timeoutMs?: number): Promise<boolean>;
  forwardSpawn(process: unknown): void;
  forwardEntry(entry: unknown): void;
  forwardStopped(processId: string): void;
  close(): void;
}

export interface CliAgentRunnerDependencies {
  brokerClient?: DelegateBrokerApi;
  createAdapter?: (agentType: AgentType, backend?: 'direct' | 'terminal') => Promise<AdapterLike>;
  createBridge?: () => DashboardBridgeLike;
  spawnDetachedDelegate?: (options: CliRunOptions, execId: string, prompt: string) => boolean;
  now?: () => string;
  renderEntry?: (entry: NormalizedEntry) => void;
}

// ---------------------------------------------------------------------------
// Public options
// ---------------------------------------------------------------------------

export interface CliRunOptions {
  prompt: string;
  tool: string;
  mode: 'analysis' | 'write';
  model?: string;
  workDir: string;
  rule?: string;
  execId?: string;
  resume?: string;
  includeDirs?: string[];
  sessionId?: string;
  backend?: 'direct' | 'terminal';
}

// ---------------------------------------------------------------------------
// Tool name -> AgentType mapping
// ---------------------------------------------------------------------------

const TOOL_TO_AGENT_TYPE: Record<string, AgentType> = {
  gemini: 'gemini',
  qwen: 'qwen',
  codex: 'codex',
  claude: 'claude-code',
  opencode: 'opencode',
};

// ---------------------------------------------------------------------------
// AgentType -> terminal CLI command mapping
// ---------------------------------------------------------------------------

const AGENT_TYPE_TO_TERMINAL_CMD: Record<string, string> = {
  'gemini': 'gemini',
  'qwen': 'qwen',
  'codex': 'codex',
  'claude-code': 'claude',
  'opencode': 'opencode',
};

// ---------------------------------------------------------------------------
// Execution ID generation
// ---------------------------------------------------------------------------

const TOOL_PREFIX: Record<string, string> = {
  gemini: 'gem',
  qwen: 'qwn',
  codex: 'cdx',
  claude: 'cld',
  opencode: 'opc',
};

export function generateCliExecId(tool: string): string {
  const prefix = TOOL_PREFIX[tool] ?? 'run';
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const rand = randomBytes(2).toString('hex'); // 4 hex chars
  return `${prefix}-${hh}${mm}${ss}-${rand}`;
}

// ---------------------------------------------------------------------------
// Prompt assembly — protocol + user prompt + template
// ---------------------------------------------------------------------------

async function assemblePrompt(
  userPrompt: string,
  mode: 'analysis' | 'write',
  rule?: string,
): Promise<string> {
  const parts: string[] = [];

  // 1. Load mode protocol
  const protocol = await loadProtocol(mode);
  if (protocol) {
    parts.push(protocol);
  }

  // 2. User prompt
  parts.push(userPrompt);

  // 3. Load rule template (if specified)
  if (rule) {
    const template = await loadTemplate(rule);
    if (template) {
      parts.push(template);
    } else {
      console.error(`Warning: template "${rule}" not found, proceeding without it.`);
    }
  }

  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// Adapter factory — dynamic import avoids rootDir cross-boundary issues
// ---------------------------------------------------------------------------

async function loadAdapterModule(adapterFile: string): Promise<Record<string, unknown>> {
  const dashboardAgents = resolve(
    import.meta.dirname ?? __dirname,
    '..', '..', 'dashboard', 'dist-server', 'server', 'agents',
  );
  const fullPath = resolve(dashboardAgents, adapterFile);
  // Convert to file:// URL for Windows compatibility with dynamic import()
  const fileUrl = pathToFileURL(fullPath).href;
  return await import(fileUrl) as Record<string, unknown>;
}

async function createAdapter(agentType: AgentType, backend?: 'direct' | 'terminal'): Promise<AdapterLike> {
  if (backend === 'terminal') {
    const { detectBackend } = await import('./terminal-backend.js');
    const { TerminalAdapter } = await import('./terminal-adapter.js');
    const termBackend = detectBackend();
    if (!termBackend) {
      throw new Error('No terminal multiplexer detected (need TMUX or WEZTERM_PANE env)');
    }
    const cmd = AGENT_TYPE_TO_TERMINAL_CMD[agentType] ?? agentType;
    return new TerminalAdapter(termBackend, cmd) as unknown as AdapterLike;
  }

  switch (agentType) {
    case 'gemini': {
      const mod = await loadAdapterModule('stream-json-adapter.js');
      const Cls = mod.StreamJsonAdapter as new (exe: string, type: string) => AdapterLike;
      return new Cls('npx -y @google/gemini-cli', 'gemini');
    }
    case 'qwen': {
      const mod = await loadAdapterModule('stream-json-adapter.js');
      const Cls = mod.StreamJsonAdapter as new (exe: string, type: string) => AdapterLike;
      return new Cls('qwen', 'qwen');
    }
    case 'codex': {
      const mod = await loadAdapterModule('codex-cli-adapter.js');
      const Cls = mod.CodexCliAdapter as new () => AdapterLike;
      return new Cls();
    }
    case 'opencode': {
      const mod = await loadAdapterModule('opencode-adapter.js');
      const Cls = mod.OpenCodeAdapter as new () => AdapterLike;
      return new Cls();
    }
    case 'claude-code': {
      const mod = await loadAdapterModule('claude-code-adapter.js');
      const Cls = mod.ClaudeCodeAdapter as new () => AdapterLike;
      return new Cls();
    }
    default:
      throw new Error(`Unsupported agent type: ${agentType}`);
  }
}

// ---------------------------------------------------------------------------
// Entry renderer — writes normalized entries to stdout/stderr
// ---------------------------------------------------------------------------

function renderEntry(entry: NormalizedEntry): void {
  switch (entry.type) {
    case 'assistant_message':
      process.stdout.write(entry.content);
      break;

    case 'tool_use':
      if (entry.status === 'running') {
        console.log(`[Tool: ${entry.name}]`);
      } else if (entry.status === 'completed' || entry.status === 'failed') {
        console.log(`[Tool ${entry.name}: ${entry.status}]`);
        if (entry.result) {
          console.log(entry.result);
        }
      }
      break;

    case 'error':
      console.error(`Error: ${entry.message}`);
      break;

    case 'file_change':
      console.log(`[File ${entry.action}: ${entry.path}]`);
      break;

    case 'command_exec':
      console.log(`[Exec: ${entry.command}]`);
      break;

    case 'token_usage':
      console.log(`[Tokens: ${entry.inputTokens}in/${entry.outputTokens}out]`);
      break;

    // Silently skip: user_message, thinking, approval_request,
    // approval_response, status_change (handled by the runner itself)
    default:
      break;
  }
}

function buildJobMetadata(options: CliRunOptions): JsonObject {
  const metadata: JsonObject = {
    tool: options.tool,
    mode: options.mode,
    workDir: options.workDir,
    prompt: options.prompt.substring(0, 200),
  };

  if (options.model) {
    metadata.model = options.model;
  }
  if (options.rule) {
    metadata.rule = options.rule;
  }
  if (options.backend) {
    metadata.backend = options.backend;
  }
  if (options.sessionId) {
    metadata.sessionId = options.sessionId;
  }
  if (options.includeDirs && options.includeDirs.length > 0) {
    metadata.includeDirs = options.includeDirs;
  }

  return metadata;
}

function mergeJsonObjects(base: JsonObject, patch?: JsonObject): JsonObject {
  return patch ? { ...base, ...patch } : { ...base };
}

function spawnQueuedDelegateWorker(
  options: CliRunOptions,
  execId: string,
  prompt: string,
): boolean {
  const entryScript = process.argv[1];
  if (!entryScript) {
    return false;
  }

  const args = [
    entryScript,
    'delegate',
    prompt,
    '--worker',
    '--to',
    options.tool,
    '--mode',
    options.mode,
    '--cd',
    options.workDir,
    '--id',
    execId,
    '--backend',
    options.backend ?? 'direct',
    '--resume',
    execId,
  ];

  if (options.model) {
    args.push('--model', options.model);
  }
  if (options.rule) {
    args.push('--rule', options.rule);
  }
  if (options.includeDirs && options.includeDirs.length > 0) {
    args.push('--includeDirs', options.includeDirs.join(','));
  }
  if (options.sessionId) {
    args.push('--session', options.sessionId);
  }

  const child = spawn(process.execPath, args, {
    cwd: options.workDir,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      MAESTRO_DISABLE_DASHBOARD_BRIDGE: '1',
    },
  });
  child.unref();
  return true;
}

function isTerminalStatus(status: string | undefined): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

function summarizeEntry(entry: NormalizedEntry): string {
  switch (entry.type) {
    case 'assistant_message':
      return entry.content.replace(/\s+/g, ' ').trim().slice(0, 200) || 'Assistant response updated';
    case 'tool_use':
      return `Tool ${entry.name} ${entry.status}`;
    case 'file_change':
      return `File ${entry.action}: ${entry.path}`;
    case 'command_exec':
      return `Command: ${entry.command}`;
    case 'error':
      return entry.message;
    case 'status_change':
      return `Status changed to ${entry.status}`;
    default:
      return `Event: ${entry.type}`;
  }
}

function shouldPublishSnapshot(entry: NormalizedEntry): boolean {
  switch (entry.type) {
    case 'assistant_message':
      return entry.partial !== true;
    case 'tool_use':
      return entry.status === 'completed' || entry.status === 'failed';
    case 'file_change':
    case 'command_exec':
    case 'error':
      return true;
    default:
      return false;
  }
}

function createNoopBridge(): DashboardBridgeLike {
  return {
    async tryConnect() {
      return false;
    },
    forwardSpawn() {
      return;
    },
    forwardEntry() {
      return;
    },
    forwardStopped() {
      return;
    },
    close() {
      return;
    },
  };
}

// ---------------------------------------------------------------------------
// CliAgentRunner
// ---------------------------------------------------------------------------

export class CliAgentRunner {
  constructor(private readonly dependencies: CliAgentRunnerDependencies = {}) {}

  /** Resolve dashboard WS URL from env → config → default port 3001 */
  private static getDashboardWsUrl(): string {
    const envPort = process.env.MAESTRO_DASHBOARD_PORT;
    if (envPort) {
      const p = parseInt(envPort, 10);
      if (!isNaN(p)) return `ws://127.0.0.1:${p}/ws`;
    }
    try {
      const configPath = resolve(process.cwd(), '.workflow', 'config.json');
      const raw = readFileSync(configPath, 'utf-8');
      const json = JSON.parse(raw) as Record<string, unknown>;
      const dashboard = json['dashboard'] as Record<string, unknown> | undefined;
      if (dashboard?.port && typeof dashboard.port === 'number') {
        return `ws://127.0.0.1:${dashboard.port}/ws`;
      }
    } catch {
      // Config missing or unreadable — use default
    }
    return 'ws://127.0.0.1:3001/ws';
  }

  /**
   * Send MCP channel notification (primary path).
   * If maestro MCP server is running in this process, push a
   * notifications/claude/channel message directly.
   */
  private static sendChannelNotification(
    _sessionId: string,
    execId: string,
    tool: string,
    mode: string,
    status: 'completed' | 'failed' | 'cancelled',
    exitCode: number,
  ): void {
    try {
      // Dynamic import to avoid circular dependency — getMcpServer is exported
      // from mcp/server.ts which may not be loaded in CLI-only mode.
      const { getMcpServer } = require('../mcp/server.js') as { getMcpServer: () => import('@modelcontextprotocol/sdk/server/index.js').Server | null };
      const server = getMcpServer();
      if (!server) return;

      const label = status === 'completed'
        ? 'DELEGATE COMPLETED'
        : status === 'cancelled'
          ? 'DELEGATE CANCELLED'
          : 'DELEGATE FAILED';
      const result = status === 'completed'
        ? 'done'
        : status === 'cancelled'
          ? 'cancelled'
          : `exit:${exitCode}`;
      const content = `[${label}] ${execId} (${tool}/${mode}) ${result}\nUse \`maestro delegate output ${execId}\` for full result.`;

      // Fire-and-forget notification via MCP protocol
      server.notification({
        method: 'notifications/claude/channel',
        params: {
          content,
          meta: { exec_id: execId, tool, mode, exit_code: String(exitCode), status },
        },
      }).catch(() => { /* best-effort */ });
    } catch {
      // MCP server module not available (CLI-only mode) — hook fallback handles it
    }
  }

  /**
   * Run a CLI agent to completion and return its exit code (0 = success).
   */
  async run(options: CliRunOptions): Promise<number> {
    const agentType = TOOL_TO_AGENT_TYPE[options.tool];
    if (!agentType) {
      console.error(`Unknown tool: ${options.tool}`);
      return 1;
    }

    // Generate or use provided execution ID
    const execId = options.execId ?? generateCliExecId(options.tool);
    process.stderr.write(`[MAESTRO_EXEC_ID=${execId}]\n`);

    // History store for persistence and resume
    const store = new CliHistoryStore();
    const broker = this.dependencies.brokerClient ?? new DelegateBrokerClient();
    const now = this.dependencies.now ?? (() => new Date().toISOString());
    const jobMetadata = buildJobMetadata(options);

    // Handle --resume: prepend previous session context to user prompt
    let userPrompt = options.prompt;
    if (options.resume) {
      let resumeId = options.resume;
      if (resumeId === 'last') {
        const recent = store.listRecent(1);
        resumeId = recent.length > 0 ? recent[0].execId : '';
      }
      if (resumeId) {
        userPrompt = store.buildResumePrompt(resumeId, userPrompt);
      } else {
        console.error('No previous execution found for --resume');
      }
    }

    // Assemble final prompt: protocol + user prompt + template
    const finalPrompt = await assemblePrompt(userPrompt, options.mode, options.rule);

    const adapterFactory = this.dependencies.createAdapter ?? createAdapter;
    const adapter = await adapterFactory(agentType, options.backend);

    // Optional Dashboard bridge — connect silently, don't block startup
    const bridgeEnabled = process.env.MAESTRO_DISABLE_DASHBOARD_BRIDGE !== '1';
    const bridge = bridgeEnabled
      ? (this.dependencies.createBridge?.() ?? new DashboardBridge())
      : createNoopBridge();
    const bridgeConnected = bridgeEnabled
      ? await bridge.tryConnect(CliAgentRunner.getDashboardWsUrl(), 1000)
      : false;
    if (!bridgeConnected) {
      process.stderr.write('[Dashboard not connected — real-time view unavailable]\n');
    }

    const config: AgentConfig = {
      type: agentType,
      prompt: finalPrompt,
      workDir: options.workDir,
      model: options.model,
      approvalMode: options.mode === 'write' ? 'auto' : 'suggest',
    };

    const agentProcess = await adapter.spawn(config);
    bridge.forwardSpawn(agentProcess as unknown as Parameters<typeof bridge.forwardSpawn>[0]);
    const agentJobMetadata = {
      ...jobMetadata,
      agentProcessId: agentProcess.id,
    } as JsonObject;
    store.saveMeta(execId, {
      execId,
      tool: options.tool,
      model: options.model,
      mode: options.mode,
      prompt: options.prompt.substring(0, 500),
      workDir: options.workDir,
      startedAt: agentProcess.startedAt,
    });

    const publishEvent = (
      type: string,
      status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled',
      summary: string,
      extraPayload: JsonObject = {},
      extraJobMetadata?: JsonObject,
    ) => {
      try {
        const snapshot = store.buildSnapshot(execId);
        broker.publishEvent({
          jobId: execId,
          type,
          status,
          snapshot: snapshot as unknown as JsonObject | undefined,
          payload: {
            execId,
            summary,
            ...extraPayload,
          },
          jobMetadata: mergeJsonObjects(agentJobMetadata, extraJobMetadata),
        });
      } catch {
        // Broker publication is best-effort and must not break CLI execution
      }
    };

    publishEvent('status_update', 'running', `Delegate started for ${options.tool}/${options.mode}`);

    // Safety net: if the process exits without a stopped event (e.g. Windows
    // shell process tree doesn't fire exit/close reliably), write meta.json
    // from the synchronous process.on('exit') handler as a last resort.
    let metaWritten = false;
    let cancellationRequested = Boolean(broker.getJob(execId)?.metadata?.cancelRequestedAt);
    let cancellationInitiated = false;
    let cancellationPoller: NodeJS.Timeout | null = null;

    const clearCancellationPoller = () => {
      if (cancellationPoller) {
        clearInterval(cancellationPoller);
        cancellationPoller = null;
      }
    };

    const saveMeta = (status: 'completed' | 'failed' | 'cancelled', exitCode: number) => {
      if (metaWritten) return;
      metaWritten = true;
      const completedAt = now();
      store.saveMeta(execId, {
        execId,
        tool: options.tool,
        model: options.model,
        mode: options.mode,
        prompt: options.prompt.substring(0, 500),
        workDir: options.workDir,
        startedAt: agentProcess.startedAt,
        completedAt,
        exitCode,
        ...(status === 'cancelled' ? { cancelledAt: completedAt } : {}),
      });

      publishEvent(
        status,
        status,
        status === 'completed'
          ? `Delegate completed: ${execId}`
          : status === 'cancelled'
            ? `Delegate cancelled: ${execId}`
            : `Delegate failed: ${execId}`,
        {
          exitCode,
          completedAt,
          status,
        },
      );

      // Write delegate completion notification (for hook fallback)
      const sessionId = options.sessionId;
      if (sessionId) {
        try {
          const notifyPath = join(tmpdir(), `${NOTIFY_PREFIX}${sessionId}.jsonl`);
          const entry = JSON.stringify({
            execId,
            tool: options.tool,
            mode: options.mode,
            prompt: options.prompt.substring(0, 200),
            exitCode,
            completedAt,
            status,
          });
          appendFileSync(notifyPath, entry + '\n', 'utf-8');

          // Try MCP channel notification (primary path)
          CliAgentRunner.sendChannelNotification(sessionId, execId, options.tool, options.mode, status, exitCode);
        } catch {
          // Non-critical — notification is best-effort
        }
      }
    };

    const processExitHandler = () => {
      saveMeta(cancellationRequested ? 'cancelled' : 'completed', cancellationRequested ? 130 : 0);
    };
    process.on('exit', processExitHandler);

    const requestCancellation = async (): Promise<void> => {
      cancellationRequested = true;
      if (cancellationInitiated) {
        return;
      }
      cancellationInitiated = true;
      publishEvent('status_update', 'running', `Cancellation requested for ${execId}`, {
        cancelRequested: true,
      });
      try {
        await adapter.stop(agentProcess.id);
      } catch {
        // Adapter stop failures are surfaced by subsequent process status events.
      }
    };

    const dispatchQueuedFollowup = (finalStatus: 'completed' | 'failed' | 'cancelled'): void => {
      let queuedMessage: ReturnType<typeof broker.listMessages>[number] | undefined;
      try {
        queuedMessage = broker.listMessages(execId).find((message) => (
          message.status === 'queued'
          && (
            (message.delivery === 'interrupt_resume' && finalStatus === 'cancelled')
            || (message.delivery === 'after_complete' && finalStatus === 'completed')
          )
        ));
      } catch {
        return;
      }

      if (!queuedMessage) {
        return;
      }

      const dispatchedAt = now();
      let launched = false;
      try {
        launched = (this.dependencies.spawnDetachedDelegate ?? spawnQueuedDelegateWorker)(
          options,
          execId,
          queuedMessage.message,
        );
      } catch {
        launched = false;
      }
      if (!launched) {
        broker.updateMessage({
          jobId: execId,
          messageId: queuedMessage.messageId,
          status: 'dropped',
          dispatchReason: 'missing-entry-script',
          now: dispatchedAt,
        });
        return;
      }

      broker.updateMessage({
        jobId: execId,
        messageId: queuedMessage.messageId,
        status: 'dispatched',
        dispatchReason: finalStatus,
        now: dispatchedAt,
      });

      publishEvent('status_update', finalStatus, `Queued follow-up dispatched via ${queuedMessage.delivery}`, {
        delivery: queuedMessage.delivery,
        messageId: queuedMessage.messageId,
      }, {
        cancelRequestedAt: null,
        cancelRequestedBy: null,
        cancelReason: null,
      });
    };

    if (!isTerminalStatus(broker.getJob(execId)?.status)) {
      cancellationPoller = setInterval(() => {
        try {
          const job = broker.getJob(execId);
          if (job?.metadata?.cancelRequestedAt && !cancellationInitiated) {
            void requestCancellation();
          }
        } catch {
          // Best-effort polling only.
        }
      }, 750);
    }
    if (cancellationRequested) {
      void requestCancellation();
    }

    return new Promise<number>((resolvePromise) => {
      const unsubscribe = adapter.onEntry(agentProcess.id, (entry) => {
        // Persist entry to JSONL history before rendering
        store.appendEntry(execId, entry as unknown as EntryLike);

        (this.dependencies.renderEntry ?? renderEntry)(entry);
        bridge.forwardEntry(entry as unknown as Parameters<typeof bridge.forwardEntry>[0]);

        if (shouldPublishSnapshot(entry)) {
          publishEvent('snapshot', 'running', summarizeEntry(entry), {
            entryType: entry.type,
          });
        }

        // Resolve when the agent process stops
        if (entry.type === 'status_change' && entry.status === 'stopped') {
          clearCancellationPoller();
          const finalStatus = cancellationRequested ? 'cancelled' : 'completed';
          saveMeta(finalStatus, cancellationRequested ? 130 : 0);
          dispatchQueuedFollowup(finalStatus);
          process.removeListener('exit', processExitHandler);
          bridge.forwardStopped(agentProcess.id);
          bridge.close();
          unsubscribe();
          resolvePromise(cancellationRequested ? 130 : 0);
        }

        // Resolve with error code on error status
        if (entry.type === 'status_change' && entry.status === 'error') {
          clearCancellationPoller();
          const finalStatus = cancellationRequested ? 'cancelled' : 'failed';
          saveMeta(finalStatus, cancellationRequested ? 130 : 1);
          dispatchQueuedFollowup(finalStatus);
          process.removeListener('exit', processExitHandler);
          bridge.forwardStopped(agentProcess.id);
          bridge.close();
          unsubscribe();
          resolvePromise(cancellationRequested ? 130 : 1);
        }
      });
    });
  }
}
