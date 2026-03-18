// ---------------------------------------------------------------------------
// MetricCard -- Glass-styled metric display card
// ---------------------------------------------------------------------------

import { SparklineChart } from './SparklineChart.js';

export interface MetricCardProps {
  /** Metric label (e.g. "Tasks Completed"). */
  label: string;
  /** Primary display value (e.g. "42" or "98%"). */
  value: string | number;
  /** Optional secondary detail text (e.g. "+5 today"). */
  detail?: string;
  /** Optional sparkline data (normalized 0-1 array). */
  sparklineData?: number[];
}

/**
 * A single metric card with glass card styling using design tokens.
 * Renders label, value, optional detail, and optional sparkline.
 */
export function MetricCard({ label, value, detail, sparklineData }: MetricCardProps) {
  return (
    <div
      className="rounded-[var(--radius-lg)] px-[var(--spacing-4)] py-[var(--spacing-3)] flex flex-col gap-[var(--spacing-1)]"
      style={{
        background: 'var(--color-bg-card-glass)',
        backdropFilter: 'var(--blur-glass)',
        WebkitBackdropFilter: 'var(--blur-glass)',
        boxShadow: 'var(--shadow-dramatic)',
      }}
    >
      <span className="text-[length:var(--font-size-xs)] text-text-secondary font-[var(--font-weight-medium)] leading-[var(--line-height-tight)]">
        {label}
      </span>
      <span className="text-[length:var(--font-size-xl)] text-text-primary font-[var(--font-weight-bold)] leading-[var(--line-height-tight)] tracking-[var(--letter-spacing-tight)]">
        {value}
      </span>
      {detail && (
        <span className="text-[length:var(--font-size-xs)] text-text-tertiary leading-[var(--line-height-tight)]">
          {detail}
        </span>
      )}
      {sparklineData && sparklineData.length > 0 && (
        <div className="mt-[var(--spacing-1)]">
          <SparklineChart data={sparklineData} height={24} />
        </div>
      )}
    </div>
  );
}
