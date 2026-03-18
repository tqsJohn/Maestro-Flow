// ---------------------------------------------------------------------------
// sparkline.ts -- Bucketed averaging algorithm for sparkline visualizations
// Ported from Symphony tps_graph() pattern
// ---------------------------------------------------------------------------

/** A single timestamped data point. */
export interface Sample {
  timestamp: number;
  value: number;
}

/**
 * Groups timestamped entries into equal-width time buckets, averages values
 * per bucket, and returns a normalized array (0-1 range).
 *
 * @param data      Raw timestamped samples (need not be sorted).
 * @param windowMs  Total time window in milliseconds (default: 10 minutes).
 * @param columns   Number of output buckets (default: 24).
 * @returns         Array of length `columns` with values in [0, 1].
 *                  Empty buckets produce 0.
 */
export function bucketedAverage(
  data: readonly Sample[],
  windowMs = 10 * 60 * 1000,
  columns = 24,
): number[] {
  if (data.length === 0) {
    return new Array<number>(columns).fill(0);
  }

  // Determine time range
  let minTs = data[0].timestamp;
  let maxTs = data[0].timestamp;
  for (const s of data) {
    if (s.timestamp < minTs) minTs = s.timestamp;
    if (s.timestamp > maxTs) maxTs = s.timestamp;
  }

  // If all timestamps are identical, use the window centered on that point
  const span = maxTs - minTs;
  const effectiveWindow = span > 0 ? Math.max(span, windowMs) : windowMs;
  const start = span > 0 ? minTs : minTs - effectiveWindow / 2;
  const bucketWidth = effectiveWindow / columns;

  // Accumulate sums and counts per bucket
  const sums = new Array<number>(columns).fill(0);
  const counts = new Array<number>(columns).fill(0);

  for (const s of data) {
    let idx = Math.floor((s.timestamp - start) / bucketWidth);
    // Clamp to valid range
    if (idx < 0) idx = 0;
    if (idx >= columns) idx = columns - 1;
    sums[idx] += s.value;
    counts[idx] += 1;
  }

  // Compute averages
  const averages = sums.map((sum, i) => (counts[i] > 0 ? sum / counts[i] : 0));

  // Normalize to 0-1
  let maxVal = 0;
  for (const v of averages) {
    if (v > maxVal) maxVal = v;
  }

  if (maxVal === 0) {
    return new Array<number>(columns).fill(0);
  }

  return averages.map((v) => v / maxVal);
}
