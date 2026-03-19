import { useRef, useState, useEffect, useCallback, type ReactNode } from 'react';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down.js';
import ChevronUp from 'lucide-react/dist/esm/icons/chevron-up.js';

// ---------------------------------------------------------------------------
// CollapsibleContent -- auto-collapses overflowing content with gradient fade
// Uses ResizeObserver to detect when content exceeds maxHeight threshold.
// Collapsed state applies mask-image gradient for smooth visual fade-out.
// ---------------------------------------------------------------------------

interface CollapsibleContentProps {
  children: ReactNode;
  maxHeight?: number;
  expandLabel?: string;
  collapseLabel?: string;
}

export function CollapsibleContent({
  children,
  maxHeight = 300,
  expandLabel = 'Show more',
  collapseLabel = 'Show less',
}: CollapsibleContentProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Measure content height via ResizeObserver
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const check = () => {
      const scrollH = el.scrollHeight;
      setIsOverflowing(scrollH > maxHeight);
    };

    // Initial check
    check();

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(check);
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [maxHeight]);

  const toggle = useCallback(() => setIsExpanded((v) => !v), []);

  const collapsed = isOverflowing && !isExpanded;

  const containerStyle: React.CSSProperties = collapsed
    ? {
        maxHeight: `${maxHeight}px`,
        overflow: 'hidden',
        maskImage: 'linear-gradient(to bottom, black calc(100% - 60px), transparent)',
        WebkitMaskImage: 'linear-gradient(to bottom, black calc(100% - 60px), transparent)',
        transition: 'max-height 0.35s ease',
      }
    : {
        maxHeight: isOverflowing ? `${contentRef.current?.scrollHeight ?? 9999}px` : 'none',
        overflow: 'hidden',
        transition: 'max-height 0.35s ease',
      };

  return (
    <div>
      <div ref={contentRef} style={containerStyle}>
        {children}
      </div>

      {isOverflowing && (
        <button
          type="button"
          onClick={toggle}
          className="flex items-center gap-1 mt-2 px-0 py-1 text-[12px] font-medium border-none bg-transparent cursor-pointer"
          style={{ color: 'color-mix(in srgb, var(--color-text-secondary) 80%, transparent)' }}
        >
          {isExpanded ? (
            <>
              <ChevronUp size={14} />
              {collapseLabel}
            </>
          ) : (
            <>
              <ChevronDown size={14} />
              {expandLabel}
            </>
          )}
        </button>
      )}
    </div>
  );
}
