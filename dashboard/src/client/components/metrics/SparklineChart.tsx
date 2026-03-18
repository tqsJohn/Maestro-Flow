// ---------------------------------------------------------------------------
// SparklineChart -- SVG bar chart for sparkline data arrays
// ---------------------------------------------------------------------------

interface SparklineChartProps {
  /** Normalized data values (0-1 range). */
  data: number[];
  /** Chart height in pixels (default: 24). */
  height?: number;
  /** Optional extra CSS class names. */
  className?: string;
}

/**
 * Renders a compact SVG bar chart from a normalized number array.
 * Uses `--color-brand` for fill via inline style for CSS variable support.
 */
export function SparklineChart({ data, height = 24, className }: SparklineChartProps) {
  if (data.length === 0) return null;

  const barGap = 1;
  const barCount = data.length;
  // Approximate width: each bar gets equal share of a reasonable container
  const barWidth = 4;
  const totalWidth = barCount * (barWidth + barGap) - barGap;
  const minBarHeight = 1;

  return (
    <svg
      width={totalWidth}
      height={height}
      viewBox={`0 0 ${totalWidth} ${height}`}
      className={className}
      role="img"
      aria-label="Sparkline chart"
    >
      {data.map((value, i) => {
        const barHeight = Math.max(value * height, minBarHeight);
        const x = i * (barWidth + barGap);
        const y = height - barHeight;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            rx={1}
            style={{ fill: 'var(--color-brand)' }}
            opacity={value > 0 ? 0.7 + value * 0.3 : 0.2}
          />
        );
      })}
    </svg>
  );
}
