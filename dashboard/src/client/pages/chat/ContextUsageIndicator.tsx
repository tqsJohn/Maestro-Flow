import { useMemo, useState } from 'react';
import { useAgentStore } from '@/client/store/agent-store.js';
import type { TokenUsageAccumulator } from '@/client/store/agent-store.js';

// ---------------------------------------------------------------------------
// ContextUsageIndicator -- SVG ring showing token usage ratio
// ---------------------------------------------------------------------------

/** Default context window size (200k tokens) */
const DEFAULT_CONTEXT_WINDOW = 200_000;

interface ContextUsageIndicatorProps {
  processId?: string | null;
  contextWindow?: number;
  size?: number;
}

/**
 * Format token count for display: 1234 -> "1.2k", 1234567 -> "1.2M"
 */
function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return count.toString();
}

/**
 * Get ring color based on usage percentage.
 * Green (0-50%), Orange (50-80%), Red (80-100%)
 */
function getRingColor(pct: number): string {
  if (pct >= 80) return 'var(--color-accent-red)';
  if (pct >= 50) return 'var(--color-accent-orange)';
  return 'var(--color-accent-green)';
}

export function ContextUsageIndicator({
  processId,
  contextWindow = DEFAULT_CONTEXT_WINDOW,
  size = 24,
}: ContextUsageIndicatorProps) {
  const tokenUsage = useAgentStore((s) =>
    processId ? s.processTokenUsage[processId] ?? null : null,
  );
  const [hovered, setHovered] = useState(false);

  const { percentage, ringColor, strokeDashoffset, circumference } = useMemo(() => {
    const usage: TokenUsageAccumulator = tokenUsage ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    const total = usage.input + usage.output;
    const pct = Math.min((total / contextWindow) * 100, 100);
    const strokeWidth = 2.5;
    const radius = (size - strokeWidth) / 2;
    const circ = 2 * Math.PI * radius;
    return {
      percentage: pct,
      ringColor: getRingColor(pct),
      strokeDashoffset: circ - (pct / 100) * circ,
      circumference: circ,
    };
  }, [tokenUsage, contextWindow, size]);

  // Don't render if no token data
  if (!tokenUsage) return null;

  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;

  return (
    <div
      className="relative flex items-center justify-center cursor-default"
      style={{ width: size, height: size }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(-90deg)' }}
      >
        {/* Track (background ring) */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-border-divider)"
          strokeWidth={strokeWidth}
        />
        {/* Progress ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: 'stroke-dashoffset 0.3s ease, stroke 0.3s ease' }}
        />
      </svg>

      {/* Tooltip */}
      {hovered && (
        <div
          className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 px-[10px] py-[6px] rounded-[8px] text-[11px] font-medium whitespace-nowrap z-50 pointer-events-none"
          style={{
            backgroundColor: 'var(--color-text-primary)',
            color: '#fff',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          <div style={{ marginBottom: 2 }}>
            {percentage.toFixed(1)}% context used
          </div>
          <div className="flex flex-col gap-[2px] text-[10px]" style={{ opacity: 0.85 }}>
            <span>Input: {formatTokenCount(tokenUsage.input)}</span>
            <span>Output: {formatTokenCount(tokenUsage.output)}</span>
            {(tokenUsage.cacheRead > 0 || tokenUsage.cacheWrite > 0) && (
              <span>Cache: {formatTokenCount(tokenUsage.cacheRead + tokenUsage.cacheWrite)}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
