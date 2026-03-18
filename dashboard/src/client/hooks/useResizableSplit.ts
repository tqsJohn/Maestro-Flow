import { useState, useRef, useCallback, useEffect } from 'react';

// ---------------------------------------------------------------------------
// useResizableSplit -- reusable split-pane resize logic
// ---------------------------------------------------------------------------

interface UseResizableSplitOptions {
  /** Default split ratio as percentage (0-100). Default: 50 */
  defaultRatio?: number;
  /** Minimum ratio percentage. Default: 25 */
  minRatio?: number;
  /** Maximum ratio percentage. Default: 75 */
  maxRatio?: number;
}

interface UseResizableSplitReturn {
  /** Current split ratio as percentage */
  ratio: number;
  /** Whether the user is currently dragging the divider */
  isDragging: boolean;
  /** Mouse-down handler to attach to the divider element */
  handleMouseDown: (e: React.MouseEvent) => void;
  /** Ref to attach to the split container element */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Programmatically set the ratio (e.g., reset to default) */
  setRatio: (value: number) => void;
}

export function useResizableSplit(options: UseResizableSplitOptions = {}): UseResizableSplitReturn {
  const { defaultRatio = 50, minRatio = 25, maxRatio = 75 } = options;

  const [ratio, setRatio] = useState(defaultRatio);
  const draggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    draggingRef.current = true;
    e.preventDefault();
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setRatio(Math.max(minRatio, Math.min(maxRatio, pct)));
    };
    const onUp = () => {
      draggingRef.current = false;
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [minRatio, maxRatio]);

  return {
    ratio,
    isDragging: draggingRef.current,
    handleMouseDown,
    containerRef,
    setRatio,
  };
}
