import { type SpawnOptions } from 'node:child_process';
import { Command } from 'commander';
import { CliHistoryStore } from '../agents/cli-history-store.js';
import { DelegateBrokerClient } from '../async/index.js';
export interface DelegateExecutionRequest {
    prompt: string;
    tool: string;
    mode: 'analysis' | 'write';
    model?: string;
    workDir: string;
    rule?: string;
    execId: string;
    resume?: string;
    includeDirs?: string[];
    sessionId?: string;
    backend: 'direct' | 'terminal';
}
interface ChildProcessLike {
    pid?: number;
    unref(): void;
}
interface SpawnLike {
    (command: string, args: readonly string[], options: SpawnOptions): ChildProcessLike;
}
export interface LaunchDetachedDelegateOptions {
    historyStore?: CliHistoryStore;
    brokerClient?: DelegateBrokerClient;
    spawnProcess?: SpawnLike;
    entryScript?: string;
    env?: NodeJS.ProcessEnv;
    now?: () => string;
}
export declare function buildDetachedDelegateWorkerArgs(request: DelegateExecutionRequest, entryScript?: string): string[];
export declare function launchDetachedDelegateWorker(request: DelegateExecutionRequest, options?: LaunchDetachedDelegateOptions): void;
export declare function registerDelegateCommand(program: Command): void;
export {};
