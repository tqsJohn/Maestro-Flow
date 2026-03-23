import { useState, useEffect, useRef } from 'react';
import { useI18n } from '@/client/i18n/index.js';

// ---------------------------------------------------------------------------
// EventLog — ring buffer event viewer with type prefix filtering
// ---------------------------------------------------------------------------

interface EventItem {
  type: string;
  data: unknown;
  timestamp: string;
}

const TYPE_COLORS: Record<string, string> = {
  commander: 'var(--color-accent-blue)',
  coordinate: 'var(--color-accent-purple)',
  supervisor: 'var(--color-accent-green)',
  agent: 'var(--color-accent-orange)',
  execution: 'var(--color-accent-yellow)',
};

function getTypeColor(type: string): string {
  const prefix = type.split(':')[0];
  return TYPE_COLORS[prefix] ?? 'var(--color-text-tertiary)';
}

export function EventLog() {
  const { t } = useI18n();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [filter, setFilter] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('limit', '200');
    if (filter) params.set('prefix', filter);

    fetch(`/api/events/recent?${params}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setEvents(Array.isArray(data) ? data : []))
      .catch(() => setEvents([]));
  }, [filter]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <div style={{ borderRadius: 12, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-divider)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--color-border-divider)' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {t('supervisor.overview.event_log')}
        </span>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by prefix..."
          style={{
            fontSize: 11, padding: '4px 10px', borderRadius: 6,
            border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)',
            color: 'var(--color-text-primary)', width: 160,
          }}
        />
      </div>
      <div ref={listRef} style={{ maxHeight: 240, overflowY: 'auto', padding: 0 }}>
        {events.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: 16 }}>
            No events
          </div>
        ) : (
          events.map((evt, i) => {
            const time = new Date(evt.timestamp);
            const timeStr = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}:${String(time.getSeconds()).padStart(2, '0')}`;
            return (
              <div
                key={`${evt.timestamp}-${i}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 16px', borderBottom: '1px solid var(--color-border-divider)',
                  fontSize: 11,
                }}
              >
                <span style={{ color: 'var(--color-text-placeholder)', fontFamily: "'SF Mono', Consolas, monospace", flexShrink: 0 }}>{timeStr}</span>
                <span style={{ color: getTypeColor(evt.type), fontWeight: 600, flexShrink: 0 }}>{evt.type}</span>
                <span style={{ color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {typeof evt.data === 'string' ? evt.data : JSON.stringify(evt.data)?.slice(0, 80)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
