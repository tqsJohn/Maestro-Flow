import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentWsHandler } from './agent-handler.js';
import { DashboardEventBus } from '../../state/event-bus.js';

class MockWebSocket {
  readyState = 1;
  sent: string[] = [];

  send(data: string): void {
    this.sent.push(data);
  }
}

describe('AgentWsHandler delegate messaging', () => {
  let agentManager: {
    spawn: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    sendMessage: ReturnType<typeof vi.fn>;
    respondApproval: ReturnType<typeof vi.fn>;
    registerCliProcess: ReturnType<typeof vi.fn>;
    addCliEntry: ReturnType<typeof vi.fn>;
    updateCliProcessStatus: ReturnType<typeof vi.fn>;
  };
  let handler: AgentWsHandler;
  let ws: MockWebSocket;
  let broadcast: (type: import('../../../shared/ws-protocol.js').WsEventType, data: unknown) => void;
  let delegateMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    agentManager = {
      spawn: vi.fn(),
      stop: vi.fn(),
      sendMessage: vi.fn(),
      respondApproval: vi.fn(),
      registerCliProcess: vi.fn(),
      addCliEntry: vi.fn(),
      updateCliProcessStatus: vi.fn(),
    };
    delegateMessage = vi.fn();
    handler = new AgentWsHandler(
      agentManager as any,
      new DashboardEventBus(),
      'D:/maestro2/.workflow',
      delegateMessage as any,
    );
    ws = new MockWebSocket();
    broadcast = vi.fn() as unknown as typeof broadcast;
  });

  it('declares delegate:message as a supported action', () => {
    expect(handler.actions).toContain('delegate:message');
  });

  it('accepts inject delivery for delegate messages', async () => {
    await handler.handle('delegate:message', {
      action: 'delegate:message',
      processId: 'cli-history-job-2',
      content: 'Inject this message',
      delivery: 'inject',
    }, ws as any, broadcast);

    expect(delegateMessage).toHaveBeenCalledWith({
      execId: 'cli-history-job-2',
      message: 'Inject this message',
      delivery: 'inject',
      requestedBy: 'dashboard:ws:delegate_message',
    });
    expect(agentManager.sendMessage).not.toHaveBeenCalled();
    expect(ws.sent).toHaveLength(0);
  });

  it('routes async delegate follow-ups through the shared delegate control', async () => {
    await handler.handle('delegate:message', {
      action: 'delegate:message',
      processId: 'cli-history-job-1',
      content: 'Continue after completion',
      delivery: 'after_complete',
    }, ws as any, broadcast);

    expect(delegateMessage).toHaveBeenCalledWith({
      execId: 'cli-history-job-1',
      message: 'Continue after completion',
      delivery: 'after_complete',
      requestedBy: 'dashboard:ws:delegate_message',
    });
    expect(agentManager.sendMessage).not.toHaveBeenCalled();
    expect(ws.sent).toHaveLength(0);
  });
});
