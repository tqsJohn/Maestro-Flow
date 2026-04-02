import { useState, useRef, useCallback } from 'react';

/**
 * Input history with up/down arrow navigation.
 * Saves current draft when browsing and restores it on return.
 */
export function useInputHistory(maxSize: number = 50) {
  const historyRef = useRef<string[]>([]);
  const [cursor, setCursor] = useState(-1); // -1 = not browsing
  const [draft, setDraft] = useState('');   // saves current input when browsing

  const add = useCallback((text: string) => {
    if (!text.trim()) return;
    historyRef.current = [text, ...historyRef.current.slice(0, maxSize - 1)];
    setCursor(-1);
  }, [maxSize]);

  const up = useCallback((currentText: string): string | null => {
    const history = historyRef.current;
    if (history.length === 0) return null;
    if (cursor === -1) setDraft(currentText); // save draft before browsing
    const next = Math.min(cursor + 1, history.length - 1);
    setCursor(next);
    return history[next] ?? null;
  }, [cursor]);

  const down = useCallback((_currentText: string): string | null => {
    if (cursor <= 0) {
      setCursor(-1);
      return draft; // restore draft
    }
    const next = cursor - 1;
    setCursor(next);
    return historyRef.current[next] ?? null;
  }, [cursor, draft]);

  const reset = useCallback(() => setCursor(-1), []);

  return { add, up, down, reset };
}
