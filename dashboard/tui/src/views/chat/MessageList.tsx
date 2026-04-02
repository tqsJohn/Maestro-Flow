import React, { useCallback } from 'react';
import { ScrollableList } from '../../components/index.js';
import { EntryRow } from './entryRenderers/index.js';
import type { NormalizedEntry } from '@shared/agent-types.js';

// ---------------------------------------------------------------------------
// MessageList
// ---------------------------------------------------------------------------

interface MessageListProps {
  entries: NormalizedEntry[];
  isFocused?: boolean;
}

export function MessageList({ entries, isFocused = true }: MessageListProps) {
  const renderItem = useCallback(
    (entry: NormalizedEntry, _index: number, _isSelected: boolean) => (
      <EntryRow entry={entry} />
    ),
    [],
  );

  return (
    <ScrollableList
      items={entries}
      renderItem={renderItem}
      isFocused={isFocused}
    />
  );
}
