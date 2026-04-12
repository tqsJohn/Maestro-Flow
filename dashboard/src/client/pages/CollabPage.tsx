import { useEffect, useContext, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ViewSwitcherContext } from '@/client/hooks/useViewSwitcher.js';
import { useCollabStore } from '@/client/store/collab-store.js';
import { CollabMembersList } from '@/client/components/collab/CollabMembersList.js';
import { CollabActivityFeed } from '@/client/components/collab/CollabActivityFeed.js';
import { ConflictHeatmap } from '@/client/components/collab/ConflictHeatmap.js';
import { CollaborationTimeline } from '@/client/components/collab/CollaborationTimeline.js';

// ---------------------------------------------------------------------------
// CollabPage — 3-tab collaboration shell (Overview / Analysis / History)
// ---------------------------------------------------------------------------

type CollabTab = 'overview' | 'analysis' | 'history';

const TAB_ITEMS = [
  { label: 'Overview', key: 'overview' as const, shortcut: '1' },
  { label: 'Analysis', key: 'analysis' as const, shortcut: '2' },
  { label: 'History', key: 'history' as const, shortcut: '3' },
] as const;

const TABS: CollabTab[] = ['overview', 'analysis', 'history'];

const tabVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export function CollabPage() {
  const members = useCollabStore((s) => s.members);
  const activity = useCollabStore((s) => s.activity);
  const loading = useCollabStore((s) => s.loading);
  const error = useCollabStore((s) => s.error);
  const activeTab = useCollabStore((s) => s.activeTab);
  const fetchMembers = useCollabStore((s) => s.fetchMembers);
  const fetchActivity = useCollabStore((s) => s.fetchActivity);
  const fetchPresence = useCollabStore((s) => s.fetchPresence);
  const setActiveTab = useCollabStore((s) => s.setActiveTab);
  const clearAll = useCollabStore((s) => s.clearAll);

  // Register ViewSwitcher items in TopBar
  const { register, unregister } = useContext(ViewSwitcherContext);

  const handleTabSwitch = useCallback(
    (index: number) => setActiveTab(TABS[index]),
    [setActiveTab],
  );

  useEffect(() => {
    register({
      items: TAB_ITEMS.map((t) => ({ label: t.label, icon: null, shortcut: t.shortcut })),
      activeIndex: TABS.indexOf(activeTab),
      onSwitch: handleTabSwitch,
    });
  }, [activeTab, register, handleTabSwitch]);

  useEffect(() => {
    return () => unregister();
  }, [unregister]);

  // Keyboard shortcut: 1/2/3 to switch tabs
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '1') setActiveTab('overview');
      else if (e.key === '2') setActiveTab('analysis');
      else if (e.key === '3') setActiveTab('history');
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [setActiveTab]);

  // Fetch data on mount
  useEffect(() => {
    void fetchMembers();
    void fetchActivity();
    void fetchPresence();
  }, [fetchMembers, fetchActivity, fetchPresence]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearAll();
  }, [clearAll]);

  // Loading state
  if (loading && members.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-secondary text-[length:var(--font-size-sm)]">
        Loading collaboration data...
      </div>
    );
  }

  // Error state
  if (error && members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <span className="text-status-failed text-[length:var(--font-size-sm)]">
          Failed to load collaboration data
        </span>
        <span className="text-text-tertiary text-[length:var(--font-size-xs)]">{error}</span>
        <button
          type="button"
          onClick={() => { void fetchMembers(); void fetchActivity(); void fetchPresence(); }}
          className="px-3 py-1 rounded-[var(--radius-md)] text-[11px] font-semibold text-text-secondary hover:text-text-primary transition-all"
          style={{ border: 'var(--style-btn-secondary-border)', background: 'var(--style-btn-secondary-bg)' }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 border-b border-border shrink-0">
        {TAB_ITEMS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={[
              'relative px-3 py-2.5 text-[length:var(--font-size-sm)] font-[var(--font-weight-medium)] transition-colors duration-150',
              activeTab === tab.key
                ? 'text-text-primary'
                : 'text-text-tertiary hover:text-text-secondary',
            ].join(' ')}
          >
            {tab.label}
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-blue rounded-t" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            className="flex-1 flex flex-col overflow-hidden p-4"
            variants={tabVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] }}
          >
            {activeTab === 'overview' && (
              <div className="flex flex-col md:flex-row gap-4 h-full overflow-hidden">
                <div className="flex-1 min-w-0 overflow-y-auto">
                  <CollabMembersList />
                </div>
                <div className="w-full md:w-[40%] min-w-0 border-l border-border pl-4 flex flex-col h-full">
                  <h3 className="text-[length:var(--font-size-sm)] font-[var(--font-weight-medium)] text-text-secondary mb-2 flex-shrink-0">
                    Activity
                  </h3>
                  <div className="flex-1 overflow-hidden">
                    <CollabActivityFeed />
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'analysis' && <ConflictHeatmap />}
            {activeTab === 'history' && <CollaborationTimeline />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
