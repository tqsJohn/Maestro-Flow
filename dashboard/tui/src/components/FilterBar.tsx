import React from 'react';
import { Box, Text, useInput } from 'ink';

// ---------------------------------------------------------------------------
// FilterBar — horizontal filter pills with Tab key cycling
// ---------------------------------------------------------------------------

export interface FilterBarProps {
  options: string[];
  activeIndex: number;
  onSelect: (index: number) => void;
  /** Only handle input when focused. Default: true */
  isFocused?: boolean;
}

export function FilterBar({
  options,
  activeIndex,
  onSelect,
  isFocused = true,
}: FilterBarProps) {
  useInput(
    (_input, key) => {
      if (key.tab && options.length > 0) {
        const next = (activeIndex + 1) % options.length;
        onSelect(next);
      }
    },
    { isActive: isFocused },
  );

  if (options.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="row" gap={1}>
      {options.map((option, i) => {
        const isActive = i === activeIndex;
        return (
          <Box key={i}>
            <Text
              bold={isActive}
              color={isActive ? 'cyan' : undefined}
              dimColor={!isActive}
            >
              {isActive ? '[' : ' '}{option}{isActive ? ']' : ' '}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
