import { create } from 'zustand';

// ---------------------------------------------------------------------------
// UI Preferences Store — client-side only, persisted to localStorage
// ---------------------------------------------------------------------------

export type CreateModalStyle = 1 | 2 | 3;
export type DetailModalStyle = 1 | 2 | 3;
export type StylePreset = 'default' | 'cowork';

const STORAGE_KEY = 'maestro-ui-prefs';

function load(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function save(patch: Record<string, unknown>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...load(), ...patch }));
  } catch {
    // ignore
  }
}

const saved = load();

interface UIPrefsStore {
  createModalStyle: CreateModalStyle;
  detailModalStyle: DetailModalStyle;
  stylePreset: StylePreset;
  setCreateModalStyle: (s: CreateModalStyle) => void;
  setDetailModalStyle: (s: DetailModalStyle) => void;
  setStylePreset: (s: StylePreset) => void;
}

export const useUIPrefsStore = create<UIPrefsStore>((set) => ({
  createModalStyle: (saved.createModalStyle as CreateModalStyle) ?? 2,
  detailModalStyle: (saved.detailModalStyle as DetailModalStyle) ?? 1,
  stylePreset: ((saved.stylePreset as StylePreset) ?? 'default'),

  setCreateModalStyle: (s) => {
    set({ createModalStyle: s });
    save({ createModalStyle: s });
  },

  setDetailModalStyle: (s) => {
    set({ detailModalStyle: s });
    save({ detailModalStyle: s });
  },

  setStylePreset: (s) => {
    set({ stylePreset: s });
    save({ stylePreset: s });
    document.documentElement.dataset.style = s;
  },
}));

// Apply saved preset on load
document.documentElement.dataset.style = ((saved.stylePreset as StylePreset) ?? 'default');
