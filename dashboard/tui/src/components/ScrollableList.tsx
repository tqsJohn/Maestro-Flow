import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';

// ---------------------------------------------------------------------------
// ScrollableList — generic windowed list with keyboard navigation
// ---------------------------------------------------------------------------

export interface ScrollableListProps<T> {
  items: T[];
  renderItem: (item: T, index: number, isSelected: boolean) => React.ReactNode;
  onSelect?: (item: T, index: number) => void;
  onHighlight?: (item: T, index: number) => void;
  isFocused?: boolean;
  /** Fixed viewport height; defaults to terminal rows minus padding */
  viewportHeight?: number;
  /** Extra vertical padding to subtract from auto-computed height */
  reservedRows?: number;
  /** Extract a stable key from an item — used to preserve selection across items changes */
  getItemKey?: (item: T) => string;
}

export function useScrollableList(itemCount: number, viewportHeight: number) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Clamp selection when items change
  useEffect(() => {
    if (itemCount === 0) {
      setSelectedIndex(0);
      setScrollOffset(0);
      return;
    }
    if (selectedIndex >= itemCount) {
      setSelectedIndex(itemCount - 1);
    }
  }, [itemCount, selectedIndex]);

  const moveUp = useCallback(() => {
    setSelectedIndex((prev) => {
      const next = Math.max(0, prev - 1);
      setScrollOffset((off) => (next < off ? next : off));
      return next;
    });
  }, []);

  const moveDown = useCallback(() => {
    setSelectedIndex((prev) => {
      const next = Math.min(itemCount - 1, prev + 1);
      setScrollOffset((off) => (next >= off + viewportHeight ? next - viewportHeight + 1 : off));
      return next;
    });
  }, [itemCount, viewportHeight]);

  return { selectedIndex, scrollOffset, moveUp, moveDown, setSelectedIndex, setScrollOffset };
}

export function ScrollableList<T>({
  items,
  renderItem,
  onSelect,
  onHighlight,
  isFocused = true,
  viewportHeight: fixedHeight,
  reservedRows = 6,
  getItemKey,
}: ScrollableListProps<T>) {
  const { stdout } = useStdout();
  const termRows = stdout?.rows ?? 24;
  const viewportHeight = fixedHeight ?? Math.max(1, termRows - reservedRows);

  const { selectedIndex, scrollOffset, moveUp, moveDown, setSelectedIndex, setScrollOffset } = useScrollableList(
    items.length,
    viewportHeight,
  );

  // Preserve selection across items changes using stable keys
  const prevKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (getItemKey && items.length > 0 && items[selectedIndex]) {
      prevKeyRef.current = getItemKey(items[selectedIndex]!);
    }
  }, [selectedIndex, items, getItemKey]);

  const prevItemsLenRef = useRef(items.length);
  useEffect(() => {
    if (!getItemKey || items.length === 0 || prevItemsLenRef.current === items.length) {
      prevItemsLenRef.current = items.length;
      return;
    }
    prevItemsLenRef.current = items.length;
    const key = prevKeyRef.current;
    if (!key) return;
    const newIdx = items.findIndex((item) => getItemKey(item) === key);
    if (newIdx >= 0) {
      setSelectedIndex(newIdx);
      // Adjust scroll to keep selection visible
      setScrollOffset((off) => {
        if (newIdx < off) return newIdx;
        if (newIdx >= off + viewportHeight) return newIdx - viewportHeight + 1;
        return off;
      });
    }
  }, [items, getItemKey, viewportHeight, setSelectedIndex, setScrollOffset]);

  useInput(
    (input, key) => {
      if (key.upArrow) {
        moveUp();
      } else if (key.downArrow) {
        moveDown();
      } else if (key.return && items.length > 0) {
        onSelect?.(items[selectedIndex]!, selectedIndex);
      }
    },
    { isActive: isFocused },
  );

  // Notify parent of highlight changes
  useEffect(() => {
    if (items.length > 0 && onHighlight) {
      onHighlight(items[selectedIndex]!, selectedIndex);
    }
  }, [selectedIndex, items, onHighlight]);

  if (items.length === 0) {
    return (
      <Box>
        <Text dimColor>(empty)</Text>
      </Box>
    );
  }

  const visibleItems = items.slice(scrollOffset, scrollOffset + viewportHeight);
  const hasAbove = scrollOffset > 0;
  const hasBelow = scrollOffset + viewportHeight < items.length;

  return (
    <Box flexDirection="column">
      {hasAbove && <Text dimColor>  [{scrollOffset} more above]</Text>}
      {visibleItems.map((item, i) => {
        const realIndex = scrollOffset + i;
        const isSelected = realIndex === selectedIndex;
        const itemKey = getItemKey ? getItemKey(item) : String(realIndex);
        return (
          <Box key={itemKey}>
            <Text color={isSelected && isFocused ? 'cyan' : undefined}>
              {isSelected ? '>' : ' '}{' '}
            </Text>
            {renderItem(item, realIndex, isSelected)}
          </Box>
        );
      })}
      {hasBelow && (
        <Text dimColor>  [{items.length - scrollOffset - viewportHeight} more below]</Text>
      )}
    </Box>
  );
}
