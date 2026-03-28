import { useState, useCallback } from 'react';
import type { CSSProperties, ReactNode, PointerEvent as ReactPointerEvent } from 'react';

// ---------------------------------------------------------------------------
// useResizableSplit -- reusable split-pane resize logic
// Adapted from AionUi's useResizableSplit with localStorage persistence,
// RAF optimization, pointer capture, and rendered drag handle.
// ---------------------------------------------------------------------------

interface UseResizableSplitOptions {
  /** Default split ratio as percentage (0-100). Default: 50 */
  defaultRatio?: number;
  /** Minimum ratio percentage. Default: 25 */
  minRatio?: number;
  /** Maximum ratio percentage. Default: 75 */
  maxRatio?: number;
  /** LocalStorage key for persisting user preference */
  storageKey?: string;
}

interface DragHandleOptions {
  className?: string;
  style?: CSSProperties;
  reverse?: boolean;
  linePlacement?: 'start' | 'end';
  lineClassName?: string;
  lineStyle?: CSSProperties;
}

interface UseResizableSplitReturn {
  /** Current split ratio as percentage */
  ratio: number;
  /** Programmatically set the ratio */
  setRatio: (value: number) => void;
  /** Pre-built drag handle JSX (positioned right, non-reversed) */
  dragHandle: ReactNode;
  /** Factory to create a drag handle with custom options */
  createDragHandle: (options?: DragHandleOptions) => ReactNode;
}

const addWindowListener = <K extends keyof WindowEventMap>(
  key: K,
  handler: (e: WindowEventMap[K]) => void,
): (() => void) => {
  window.addEventListener(key, handler);
  return () => window.removeEventListener(key, handler);
};

/** Run a stack of cleanup functions in reverse order */
const removeStack = (...fns: Array<() => void>): (() => void) => {
  return () => {
    const list = fns.slice();
    while (list.length) list.pop()!();
  };
};

function readStoredRatio(storageKey: string | undefined, defaultRatio: number, minRatio: number, maxRatio: number): number {
  if (!storageKey) return defaultRatio;
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const v = parseFloat(stored);
      if (!isNaN(v) && v >= minRatio && v <= maxRatio) return v;
    }
  } catch { /* ignore */ }
  return defaultRatio;
}

export function useResizableSplit(options: UseResizableSplitOptions = {}): UseResizableSplitReturn {
  const { defaultRatio = 50, minRatio = 25, maxRatio = 75, storageKey } = options;

  const [ratio, setRatioState] = useState(() => readStoredRatio(storageKey, defaultRatio, minRatio, maxRatio));

  const persistRatio = useCallback((value: number) => {
    setRatioState(value);
    if (storageKey) {
      try { localStorage.setItem(storageKey, value.toString()); } catch { /* ignore */ }
    }
  }, [storageKey]);

  const handleDragStart = useCallback(
    (reverse = false) =>
      (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.pointerType !== 'touch' && event.button !== 0) return;
        event.preventDefault();

        const dragHandle = event.currentTarget as HTMLElement;
        const parent = dragHandle.parentElement;
        const outerContainer = parent?.parentElement;
        const containerWidth = outerContainer?.offsetWidth || 0;
        if (!containerWidth) return;

        const startX = event.clientX;
        const startRatio = ratio;
        const pointerId = event.pointerId;
        let rafId: number | null = null;
        let pendingRatio: number | null = null;
        let latestRatio = startRatio;
        let isDragging = true;
        let cleanupListeners: (() => void) | null = null;

        const flushPendingRatio = () => {
          if (pendingRatio === null) return;
          latestRatio = pendingRatio;
          setRatioState(pendingRatio);
        };

        const initDragStyle = () => {
          const originalUserSelect = document.body.style.userSelect;
          document.body.style.userSelect = 'none';
          document.body.style.cursor = 'col-resize';
          return () => {
            document.body.style.userSelect = originalUserSelect;
            document.body.style.cursor = '';
            if (rafId !== null) {
              cancelAnimationFrame(rafId);
              rafId = null;
            }
          };
        };

        const finishDrag = (e?: globalThis.PointerEvent | MouseEvent | FocusEvent) => {
          if (!isDragging) return;
          isDragging = false;

          if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
          flushPendingRatio();

          let finalRatio = latestRatio;
          if (e && 'clientX' in e && typeof e.clientX === 'number') {
            const deltaX = reverse ? startX - e.clientX : e.clientX - startX;
            const deltaRatio = (deltaX / containerWidth) * 100;
            finalRatio = Math.max(minRatio, Math.min(maxRatio, startRatio + deltaRatio));
          }

          persistRatio(finalRatio);
          cleanupListeners?.();
        };

        const handlePointerMove = (e: globalThis.PointerEvent) => {
          if (!isDragging) return;
          if (e.buttons === 0) { finishDrag(e); return; }
          const deltaX = reverse ? startX - e.clientX : e.clientX - startX;
          const deltaRatio = (deltaX / containerWidth) * 100;
          pendingRatio = Math.max(minRatio, Math.min(maxRatio, startRatio + deltaRatio));
          if (rafId === null) {
            rafId = requestAnimationFrame(() => {
              rafId = null;
              flushPendingRatio();
            });
          }
        };

        const handleLostPointerCapture = () => finishDrag();
        const handlePointerUp = (e: globalThis.PointerEvent) => finishDrag(e);
        const handlePointerCancel = (e: globalThis.PointerEvent) => finishDrag(e);
        const handleMouseUp = (e: MouseEvent) => finishDrag(e);

        // Pointer capture for reliable tracking even if cursor leaves the handle
        if (dragHandle.setPointerCapture) {
          try {
            dragHandle.setPointerCapture(pointerId);
            dragHandle.addEventListener('lostpointercapture', handleLostPointerCapture);
          } catch { /* ignore */ }
        }

        const releasePointerCapture = () => {
          if (dragHandle.releasePointerCapture && dragHandle.hasPointerCapture?.(pointerId)) {
            dragHandle.releasePointerCapture(pointerId);
          }
          dragHandle.removeEventListener('lostpointercapture', handleLostPointerCapture);
        };

        cleanupListeners = removeStack(
          initDragStyle(),
          releasePointerCapture,
          addWindowListener('pointermove', handlePointerMove),
          addWindowListener('pointerup', handlePointerUp),
          addWindowListener('pointercancel', handlePointerCancel),
          addWindowListener('mouseup', handleMouseUp),
          addWindowListener('blur', () => finishDrag()),
        );
      },
    [ratio, minRatio, maxRatio, persistRatio],
  );

  const createDragHandle = useCallback(
    (opts: DragHandleOptions = {}) => {
      const { className = '', style, reverse, linePlacement, lineClassName = '', lineStyle } = opts;

      const justifyClass = linePlacement
        ? linePlacement === 'start' ? 'justify-start' : 'justify-end'
        : reverse ? 'justify-start' : 'justify-end';

      return (
        <div
          className={`group absolute top-0 bottom-0 z-20 cursor-col-resize flex items-center ${justifyClass} ${className}`}
          style={{ width: '12px', ...style }}
          onPointerDown={handleDragStart(reverse)}
          onDoubleClick={() => persistRatio(defaultRatio)}
        >
          <span
            className={`pointer-events-none block h-full rounded-full transition-all duration-150 w-[2px] opacity-60 group-hover:w-[5px] group-hover:opacity-100 group-active:w-[5px] group-active:opacity-100 ${lineClassName}`}
            style={{
              backgroundColor: 'var(--color-border)',
              ...lineStyle,
            }}
          />
        </div>
      );
    },
    [handleDragStart, persistRatio, defaultRatio],
  );

  const dragHandle = createDragHandle({ className: 'right-0' });

  return { ratio, setRatio: persistRatio, dragHandle, createDragHandle };
}
