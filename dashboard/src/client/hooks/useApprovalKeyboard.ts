import { useEffect, useMemo } from 'react';
import { useAgentStore } from '@/client/store/agent-store.js';
import { sendWsMessage } from '@/client/hooks/useWebSocket.js';

// ---------------------------------------------------------------------------
// useApprovalKeyboard -- global keyboard shortcuts for pending approvals
//   Y = Allow (once)    Esc = Deny    A = Always allow
// ---------------------------------------------------------------------------

export function useApprovalKeyboard(processId: string | null): void {
  const pendingApprovals = useAgentStore((s) => s.pendingApprovals);

  // Memoize the specific approval for this process so the effect only
  // re-registers when the relevant approval actually changes.
  const approval = useMemo(() => {
    if (!processId) return null;
    return Object.values(pendingApprovals).find(
      (a) => a.processId === processId,
    ) ?? null;
  }, [processId, pendingApprovals]);

  useEffect(() => {
    if (!approval) return;

    function handleKeyDown(e: KeyboardEvent) {
      // Skip when user is typing in an input field
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      const key = e.key;

      // Y = Allow (proceed once)
      if (key === 'y' || key === 'Y') {
        e.preventDefault();
        sendWsMessage({
          action: 'approve',
          processId: approval!.processId,
          requestId: approval!.id,
          allow: true,
        });
        return;
      }

      // Escape = Deny
      if (key === 'Escape') {
        e.preventDefault();
        sendWsMessage({
          action: 'approve',
          processId: approval!.processId,
          requestId: approval!.id,
          allow: false,
        });
        return;
      }

      // A = Always allow (send as allow -- "always" semantics handled server-side)
      if (key === 'a' || key === 'A') {
        e.preventDefault();
        sendWsMessage({
          action: 'approve',
          processId: approval!.processId,
          requestId: approval!.id,
          allow: true,
        });
        return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [approval]);
}
