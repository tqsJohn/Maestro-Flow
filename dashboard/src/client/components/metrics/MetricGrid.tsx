// ---------------------------------------------------------------------------
// MetricGrid -- Responsive grid wrapper for MetricCard components
// ---------------------------------------------------------------------------

import type { ReactNode } from 'react';

interface MetricGridProps {
  children: ReactNode;
  /** Optional extra CSS class names. */
  className?: string;
}

/**
 * Responsive auto-fit grid container for metric cards.
 * Uses CSS grid with repeat(auto-fit, minmax(180px, 1fr)).
 */
export function MetricGrid({ children, className }: MetricGridProps) {
  return (
    <div
      className={[
        'grid gap-[var(--spacing-3)]',
        className,
      ].filter(Boolean).join(' ')}
      style={{
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      }}
    >
      {children}
    </div>
  );
}
