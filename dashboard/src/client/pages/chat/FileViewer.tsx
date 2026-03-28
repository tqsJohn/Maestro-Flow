import { useState, useEffect } from 'react';
import X from 'lucide-react/dist/esm/icons/x.js';
import FileText from 'lucide-react/dist/esm/icons/file-text.js';

// ---------------------------------------------------------------------------
// FileViewer — displays file content in a read-only pane
// ---------------------------------------------------------------------------

interface FileViewerProps {
  filePath: string;
  onClose: () => void;
}

export function FileViewer({ filePath, onClose }: FileViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/workspace/file?path=${encodeURIComponent(filePath)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError(`Failed to load: ${res.status}`);
          setContent(null);
        } else {
          setContent(await res.text());
        }
      })
      .catch(() => {
        if (!cancelled) setError('Failed to fetch file');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [filePath]);

  const fileName = filePath.split('/').pop() ?? filePath;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="shrink-0 flex items-center gap-2 px-4 py-2 border-b"
        style={{ borderColor: 'var(--color-border-divider)', backgroundColor: 'var(--color-bg-secondary)' }}
      >
        <FileText size={13} strokeWidth={1.8} style={{ color: 'var(--color-text-tertiary)' }} />
        <span
          className="text-[12px] font-medium truncate flex-1"
          style={{ color: 'var(--color-text-primary)' }}
          title={filePath}
        >
          {fileName}
        </span>
        <span
          className="text-[10px] truncate max-w-[200px]"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          {filePath}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="w-6 h-6 rounded flex items-center justify-center transition-colors"
          style={{ color: 'var(--color-text-tertiary)' }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--color-bg-hover)';
            (e.currentTarget as HTMLElement).style.color = 'var(--color-text-primary)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
            (e.currentTarget as HTMLElement).style.color = 'var(--color-text-tertiary)';
          }}
          aria-label="Close file viewer"
        >
          <X size={12} strokeWidth={2} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="p-4 text-[12px] animate-pulse" style={{ color: 'var(--color-text-tertiary)' }}>
            Loading...
          </div>
        )}
        {error && (
          <div className="p-4 text-[12px]" style={{ color: 'var(--color-accent-red)' }}>
            {error}
          </div>
        )}
        {!loading && !error && content !== null && (
          <pre
            className="p-4 m-0 text-[12px] leading-[1.7] whitespace-pre-wrap break-words"
            style={{
              color: 'var(--color-text-secondary)',
              fontFamily: 'var(--font-mono)',
              tabSize: 2,
            }}
          >
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}
