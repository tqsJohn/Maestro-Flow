// ---------------------------------------------------------------------------
// CoordinateBrokerAdapter — forwards walker events into the file-backed
// delegate broker so external consumers (CLI `watch`, MCP tools, dashboard)
// can stream live progress without polling walker-state.json.
//
// Reuses FileDelegateBroker's generic job/event model:
//   - Each walker session becomes a broker "job" keyed by session_id.
//   - Each CoordinateEvent becomes one job event.
//   - Publishing implicitly creates the job record on the first call, so
//     no explicit registerJob is needed.
//
// The adapter is session-agnostic: it extracts session_id from each event,
// so a single instance can be reused across walker starts without knowing
// the id up front.
//
// Fire-and-forget: publishEvent failures are logged and swallowed. Walker
// progress must never stall on telemetry.
// ---------------------------------------------------------------------------

import type {
  CoordinateEvent,
  WalkerEventEmitter,
} from './graph-types.js';
import type {
  DelegateBrokerApi,
  JsonObject,
  JsonValue,
} from '../async/delegate-broker.js';

export interface CoordinateBrokerAdapterOptions {
  /** Optional jobMetadata attached to every event. */
  jobMetadata?: JsonObject;
}

export class CoordinateBrokerAdapter implements WalkerEventEmitter {
  constructor(
    private readonly broker: DelegateBrokerApi,
    private readonly opts: CoordinateBrokerAdapterOptions = {},
  ) {}

  emit(event: CoordinateEvent): void {
    const sessionId = (event as { session_id?: string }).session_id;
    if (!sessionId) return;
    try {
      this.broker.publishEvent({
        jobId: sessionId,
        type: event.type,
        payload: toJsonObject(event),
        jobMetadata: this.opts.jobMetadata,
      });
    } catch (err) {
      console.error(
        `[coordinate-broker-adapter] publishEvent failed for ${sessionId}/${event.type}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// JSON coercion — CoordinateEvent fields are typed as `unknown` in some
// cases (decision.resolved_value). The broker requires JsonValue; coerce
// unserializable values to their string representation so publishEvent
// never throws on legal walker state.
// ---------------------------------------------------------------------------

function toJsonObject(event: CoordinateEvent): JsonObject {
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(event)) {
    out[key] = toJsonValue(value);
  }
  return out;
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null || value === undefined) return null;
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return value as JsonValue;
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (t === 'object') {
    const out: JsonObject = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = toJsonValue(v);
    }
    return out;
  }
  return String(value);
}
