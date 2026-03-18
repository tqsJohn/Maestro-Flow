import { useState, useEffect, useRef } from 'react';
import { useAgentStore } from '@/client/store/agent-store.js';
import { sendWsMessage } from '@/client/hooks/useWebSocket.js';

// ---------------------------------------------------------------------------
// ThoughtDisplay -- real-time thought overlay shown above ChatInput
// ---------------------------------------------------------------------------

/** Format elapsed seconds as "Xs" or "Xm Ys" */
function formatElapsedTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export function ThoughtDisplay({ processId }: { processId: string | null }) {
  const thought = useAgentStore((s) => (processId ? s.processThoughts[processId] : undefined));
  const streaming = useAgentStore((s) => (processId ? (s.processStreaming[processId] ?? false) : false));
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(Date.now());

  // Reset timer when streaming starts or thought subject changes
  useEffect(() => {
    if (!streaming && !thought?.subject) {
      setElapsed(0);
      return;
    }

    startRef.current = Date.now();
    setElapsed(0);

    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [streaming, thought?.subject]);

  // Nothing to show
  if (!streaming && !thought?.subject) return null;

  const handleStop = () => {
    if (processId) {
      sendWsMessage({ action: 'stop', processId });
    }
  };

  // Streaming but no thought yet -- show "Processing..." with spinner
  if (streaming && !thought?.subject) {
    return (
      <div style={containerStyle}>
        <div style={rowStyle}>
          <Spinner />
          <span style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>
            Processing...
            <span style={{ marginLeft: 6, opacity: 0.6 }}>({formatElapsedTime(elapsed)})</span>
          </span>
          <StopButton onClick={handleStop} />
        </div>
      </div>
    );
  }

  const showDescription = thought && thought.description && thought.description !== thought.subject;

  return (
    <div style={containerStyle}>
      <div style={rowStyle}>
        {streaming && <Spinner />}
        {thought?.subject && (
          <span style={tagStyle}>{thought.subject}</span>
        )}
        {showDescription && (
          <span
            style={{
              flex: 1,
              fontSize: 12,
              color: 'var(--color-text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {thought!.description}
          </span>
        )}
        {streaming && (
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>
            ({formatElapsedTime(elapsed)})
          </span>
        )}
        {streaming && <StopButton onClick={handleStop} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const containerStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, var(--color-bg-card) 0%, var(--color-bg-primary) 100%)',
  borderRadius: 10,
  padding: '8px 12px',
  margin: '0 16px 4px 16px',
  border: '1px solid var(--color-border-divider)',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const tagStyle: React.CSSProperties = {
  display: 'inline-block',
  fontSize: 11,
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: 6,
  backgroundColor: 'var(--color-tint-exploring)',
  color: 'var(--color-accent-blue)',
  whiteSpace: 'nowrap',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Spinner() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-accent-blue)"
      strokeWidth="2.5"
      strokeLinecap="round"
      style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}

function StopButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        marginLeft: 'auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 22,
        height: 22,
        borderRadius: 6,
        border: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-bg-card)',
        cursor: 'pointer',
        color: 'var(--color-text-tertiary)',
        flexShrink: 0,
        padding: 0,
        transition: 'all 150ms',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.borderColor = 'var(--color-accent-red)';
        el.style.backgroundColor = 'var(--color-tint-blocked)';
        el.style.color = 'var(--color-accent-red)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.borderColor = 'var(--color-border)';
        el.style.backgroundColor = 'var(--color-bg-card)';
        el.style.color = 'var(--color-text-tertiary)';
      }}
      aria-label="Stop process"
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
        <rect x="4" y="4" width="16" height="16" rx="2" />
      </svg>
    </button>
  );
}
