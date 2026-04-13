import { type DelegateBrokerApi } from '../async/index.js';
import type { AgentType, AgentConfig, AgentProcess, NormalizedEntry } from '../../shared/agent-types.js';
/** Minimal adapter interface matching BaseAgentAdapter's public surface */
interface AdapterLike {
    spawn(config: AgentConfig): Promise<AgentProcess>;
    stop(processId: string): Promise<void>;
    onEntry(processId: string, cb: (entry: NormalizedEntry) => void): () => void;
    sendMessage?(processId: string, content: string): Promise<void>;
    supportsInteractive?(): boolean;
    endInput?(processId: string): void;
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
export declare function generateCliExecId(tool: string): string;
export declare class CliAgentRunner {
    private readonly dependencies;
    constructor(dependencies?: CliAgentRunnerDependencies);
    /** Resolve dashboard WS URL from env → config → default port 3001 */
    private static getDashboardWsUrl;
    /**
     * Send MCP channel notification (primary path).
     * If maestro MCP server is running in this process, push a
     * notifications/claude/channel message directly.
     */
    private static sendChannelNotification;
    /**
     * Run a CLI agent to completion and return its exit code (0 = success).
     */
    run(options: CliRunOptions): Promise<number>;
}
export {};
