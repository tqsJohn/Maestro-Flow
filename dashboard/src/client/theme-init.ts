// ---------------------------------------------------------------------------
// Eager theme initialization -- runs at module-load time, before React.
// Sets document.documentElement.dataset.theme to avoid a flash of wrong theme.
// ---------------------------------------------------------------------------

(function initTheme() {
  if (typeof window === 'undefined') return;

  try {
    const stored = localStorage.getItem('theme');
    let resolved: string;

    if (stored === 'dark' || stored === 'light') {
      resolved = stored;
    } else {
      // 'system' or missing -- defer to OS preference
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }

    document.documentElement.dataset.theme = resolved;
  } catch {
    // localStorage blocked or matchMedia unavailable -- leave default
  }
})();
