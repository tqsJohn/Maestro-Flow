import { useState, useRef, useEffect } from 'react';

/**
 * Batches high-frequency updates into fewer re-renders.
 * Uses setTimeout (Node.js -- no rAF) to coalesce rapid updates.
 *
 * Usage: const batchedEntries = useStreamBatcher(entries, 16);
 * -- entries updates at ~30fps from WS, batchedEntries updates at ~60fps max
 */
export function useStreamBatcher<T>(items: T[], intervalMs: number = 16): T[] {
  const [batchedItems, setBatchedItems] = useState<T[]>(items);
  const pendingRef = useRef<T[] | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    pendingRef.current = items;

    if (timerRef.current === null) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (pendingRef.current !== null) {
          setBatchedItems(pendingRef.current);
          pendingRef.current = null;
        }
      }, intervalMs);
    }
  }, [items, intervalMs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return batchedItems;
}
