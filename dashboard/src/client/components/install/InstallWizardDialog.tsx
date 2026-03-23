import * as Dialog from '@radix-ui/react-dialog';
import { useInstallStore } from '@/client/store/install-store.js';
import { WizardStepper } from './WizardStepper.js';
import { StepModeSelect } from './StepModeSelect.js';
import { StepConfigure } from './StepConfigure.js';
import { StepReview } from './StepReview.js';
import { StepProgress } from './StepProgress.js';
import { cn } from '@/client/lib/utils.js';

export function InstallWizardDialog() {
  const open = useInstallStore((s) => s.open);
  const setOpen = useInstallStore((s) => s.setOpen);
  const step = useInstallStore((s) => s.step);
  const installing = useInstallStore((s) => s.installing);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && installing) return; // Prevent close during install
        setOpen(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
            'w-[640px] max-w-[95vw] max-h-[85vh]',
            'rounded-[var(--radius-lg)] border border-border bg-bg-primary shadow-lg',
            'flex flex-col overflow-hidden',
            'focus:outline-none',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
            <div className="flex items-center gap-4">
              <Dialog.Title className="text-[14px] font-semibold text-text-primary">
                Install Wizard
              </Dialog.Title>
              <WizardStepper current={step} />
            </div>
            {!installing && (
              <Dialog.Close
                className={cn(
                  'w-7 h-7 flex items-center justify-center rounded-[var(--radius-sm)]',
                  'text-text-tertiary hover:text-text-primary hover:bg-bg-hover',
                  'transition-colors',
                )}
                aria-label="Close"
              >
                <svg className="w-[14px] h-[14px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </Dialog.Close>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-5">
            {step === 'mode' && <StepModeSelect />}
            {step === 'configure' && <StepConfigure />}
            {step === 'review' && <StepReview />}
            {step === 'progress' && <StepProgress />}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
