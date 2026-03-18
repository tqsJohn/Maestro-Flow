import { useState, useCallback } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { useAgentStore } from '@/client/store/agent-store.js';
import { useAutoScroll } from '@/client/hooks/useAutoScroll.js';
import { EntryRenderer } from './entries/index.js';
import { EntryContextMenu } from './entries/EntryContextMenu.js';
import { CreateIssueDialog } from '@/client/components/issues/CreateIssueDialog.js';
import type { NormalizedEntry } from '@/shared/agent-types.js';
import type { CreateIssueRequest } from '@/shared/issue-types.js';

// Stable empty array to avoid infinite re-render from Zustand selector
const EMPTY_ENTRIES: NormalizedEntry[] = [];

// ---------------------------------------------------------------------------
// MessageArea -- virtualized scrollable message list for a given process
// ---------------------------------------------------------------------------

export function MessageArea({ processId }: { processId: string | null }) {
  const entries = useAgentStore((s) =>
    processId ? (s.entries[processId] ?? EMPTY_ENTRIES) : EMPTY_ENTRIES,
  );

  const {
    virtuosoRef,
    handleScroll,
    handleFollowOutput,
    handleAtBottomStateChange,
    showScrollButton,
    scrollToBottom,
  } = useAutoScroll({ entries, itemCount: entries.length });

  // Issue creation state
  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [issuePrefill, setIssuePrefill] = useState<Partial<CreateIssueRequest> | undefined>();

  const handleCreateIssue = useCallback((prefill: Partial<CreateIssueRequest>) => {
    setIssuePrefill(prefill);
    setIssueDialogOpen(true);
  }, []);

  if (!processId) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-tertiary text-[length:var(--font-size-sm)]">
        Select a session or start a new conversation
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-tertiary text-[length:var(--font-size-sm)]">
        No messages yet
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        <Virtuoso
          ref={virtuosoRef}
          data={entries}
          followOutput={handleFollowOutput}
          atBottomStateChange={handleAtBottomStateChange}
          onScroll={handleScroll}
          atBottomThreshold={60}
          className="h-full"
          style={{ height: '100%' }}
          itemContent={(_index, entry) => (
            <div className="max-w-[780px] mx-auto px-6">
              <EntryContextMenu entry={entry} onCreateIssue={handleCreateIssue}>
                <EntryRenderer entry={entry} />
              </EntryContextMenu>
            </div>
          )}
        />

        {/* Floating scroll-to-bottom button */}
        {showScrollButton && (
          <button
            type="button"
            onClick={() => scrollToBottom('smooth')}
            style={{
              position: 'absolute',
              bottom: '16px',
              right: '16px',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg-secondary)',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              transition: 'opacity 150ms ease',
              zIndex: 10,
            }}
            aria-label="Scroll to bottom"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M8 3v10M4 9l4 4 4-4" />
            </svg>
          </button>
        )}
      </div>

      <CreateIssueDialog
        open={issueDialogOpen}
        onOpenChange={setIssueDialogOpen}
        prefill={issuePrefill}
      />
    </>
  );
}
