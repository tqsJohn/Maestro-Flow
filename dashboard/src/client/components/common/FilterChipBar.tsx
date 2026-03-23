// ---------------------------------------------------------------------------
// FilterChipBar — horizontal chip row with active toggle
// ---------------------------------------------------------------------------

interface FilterChipBarProps {
  chips: string[];
  active: string;
  onSelect: (chip: string) => void;
}

export function FilterChipBar({ chips, active, onSelect }: FilterChipBarProps) {
  return (
    <div className="flex items-center gap-[var(--spacing-1-5)] overflow-x-auto shrink-0">
      {chips.map((chip) => {
        const isActive = chip === active;
        return (
          <button
            key={chip}
            type="button"
            onClick={() => onSelect(chip)}
            className={[
              'px-[var(--spacing-3)] py-[var(--spacing-1)]',
              'text-[length:var(--font-size-xs)] font-[var(--font-weight-medium)] whitespace-nowrap',
              'transition-all duration-[var(--duration-fast)] ease-[var(--ease-notion)]',
              'focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]',
              isActive
                ? ''
                : 'hover:text-text-primary',
            ].join(' ')}
            style={isActive
              ? { borderRadius: 'var(--style-chip-radius)', border: 'var(--style-chip-border)', backgroundColor: 'var(--style-chip-active-bg)', color: 'var(--style-chip-active-color)' }
              : { borderRadius: 'var(--style-chip-radius)', border: 'var(--style-chip-border)', backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-secondary)' }
            }
          >
            {chip}
          </button>
        );
      })}
    </div>
  );
}
