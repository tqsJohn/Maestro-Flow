import React from 'react';
import { Box, Text } from 'ink';

// ---------------------------------------------------------------------------
// SplitPane — horizontal split layout with configurable ratio
// ---------------------------------------------------------------------------

export interface SplitPaneProps {
  left: React.ReactNode;
  right: React.ReactNode;
  /** Left pane width percentage (0-100). Default: 40 */
  ratio?: number;
  /** Character for vertical border between panes. Default: '|' */
  borderChar?: string;
}

export function SplitPane({
  left,
  right,
  ratio = 40,
  borderChar = '|',
}: SplitPaneProps) {
  const leftWidth = `${ratio}%`;
  const rightWidth = `${100 - ratio}%`;

  return (
    <Box flexDirection="row" width="100%" height="100%">
      <Box flexDirection="column" width={leftWidth}>
        {left}
      </Box>
      <Box flexDirection="column" flexShrink={0}>
        <Text dimColor>{borderChar}</Text>
      </Box>
      <Box flexDirection="column" width={rightWidth}>
        {right}
      </Box>
    </Box>
  );
}
