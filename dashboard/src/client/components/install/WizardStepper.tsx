import type { WizardStep } from '@/client/store/install-store.js';

const STEPS: { id: WizardStep; label: string }[] = [
  { id: 'mode', label: 'Mode' },
  { id: 'configure', label: 'Configure' },
  { id: 'review', label: 'Review' },
  { id: 'progress', label: 'Install' },
];

export function WizardStepper({ current }: { current: WizardStep }) {
  const currentIdx = STEPS.findIndex((s) => s.id === current);

  return (
    <div className="flex items-center gap-1 px-1">
      {STEPS.map((step, i) => {
        const isCompleted = i < currentIdx;
        const isActive = i === currentIdx;

        return (
          <div key={step.id} className="flex items-center gap-1">
            {i > 0 && (
              <div
                className="w-8 h-px"
                style={{
                  background: isCompleted
                    ? 'var(--color-status-completed, #5A9E78)'
                    : 'var(--color-border, #E8E5DE)',
                }}
              />
            )}
            <div className="flex items-center gap-[6px]">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold font-mono"
                style={{
                  background: isCompleted
                    ? 'var(--color-status-completed, #5A9E78)'
                    : isActive
                      ? 'var(--color-text-primary, #1A1917)'
                      : 'var(--color-bg-card, #F8F7F5)',
                  color: isCompleted || isActive ? '#fff' : 'var(--color-text-tertiary)',
                  border: !isCompleted && !isActive ? '1px solid var(--color-border, #E8E5DE)' : 'none',
                }}
              >
                {isCompleted ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className="text-[11px] font-semibold whitespace-nowrap"
                style={{
                  color: isActive
                    ? 'var(--color-text-primary)'
                    : 'var(--color-text-tertiary)',
                }}
              >
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
