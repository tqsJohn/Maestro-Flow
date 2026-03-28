// ---------------------------------------------------------------------------
// WalkerEventBridge -- bridges GraphWalker events to DashboardEventBus
// ---------------------------------------------------------------------------

import type { CoordinateEvent, WalkerEventEmitter } from '../../../../src/coordinator/graph-types.js';
import type { DashboardEventBus } from '../state/event-bus.js';

// ---------------------------------------------------------------------------
// WalkerEventBridge
// ---------------------------------------------------------------------------

export class WalkerEventBridge implements WalkerEventEmitter {
  constructor(
    private readonly mode: 'coordinate' | 'execution',
    private readonly eventBus: DashboardEventBus,
    private readonly sessionId?: string,
  ) {}

  emit(event: CoordinateEvent): void {
    // 1. Forward raw walker events to dashboard event bus
    this.eventBus.emit(event.type as any, event);

    // 2. Translate walker:command → coordinate:step
    if (event.type === 'walker:command') {
      const status = event.status;

      if (this.mode === 'coordinate') {
        // Coordinate mode: emit for ALL statuses (spawned/completed/failed)
        this.eventBus.emit('coordinate:step' as any, {
          sessionId: event.session_id,
          step: {
            cmd: event.cmd ?? event.node_id,
            status: status === 'completed' ? 'completed'
              : status === 'failed' ? 'failed'
              : 'running',
            summary: (event as any).summary ?? null,
            qualityScore: (event as any).quality_score ?? null,
          },
        });
      } else {
        // Execution mode: emit ONLY for completed/failed (NOT spawned)
        if (status === 'completed' || status === 'failed') {
          const sid = this.sessionId ?? event.session_id;
          this.eventBus.emit('coordinate:step' as any, {
            sessionId: sid,
            step: {
              cmd: event.cmd ?? event.node_id,
              status: status === 'completed' ? 'completed' : 'failed',
              summary: (event as any).summary ?? null,
              qualityScore: null,
            },
          });
        }
      }
    }

    // 3. Map gate:waiting → coordinate:clarification_needed
    if ((event as any).type === 'walker:gate_waiting') {
      this.eventBus.emit('coordinate:clarification_needed', {
        sessionId: (event as any).session_id ?? this.sessionId ?? '',
        question: (event as any).wait_message ?? 'Gate condition not met. Waiting for input.',
      });
    }
  }
}
