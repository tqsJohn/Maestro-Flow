import { useInstallStore } from '@/client/store/install-store.js';

export function StepReview() {
  const mode = useInstallStore((s) => s.mode);
  const projectPath = useInstallStore((s) => s.projectPath);
  const detection = useInstallStore((s) => s.detection);
  const selectedComponents = useInstallStore((s) => s.selectedComponents);
  const backup = useInstallStore((s) => s.backup);
  const mcpEnabled = useInstallStore((s) => s.mcpEnabled);
  const enabledTools = useInstallStore((s) => s.enabledTools);
  const setStep = useInstallStore((s) => s.setStep);
  const install = useInstallStore((s) => s.install);

  if (!detection) return null;

  const selectedComps = detection.components.filter(
    (c) => c.available && selectedComponents.has(c.id),
  );
  const totalFiles = selectedComps.reduce((sum, c) => sum + c.fileCount, 0);
  const hasMcp = selectedComponents.has('mcp');

  return (
    <div className="flex flex-col gap-5 max-w-[560px] mx-auto py-4">
      <div>
        <h3 className="text-[14px] font-semibold text-text-primary mb-1">Review Installation</h3>
        <p className="text-[12px] text-text-tertiary">
          Confirm the following will be installed.
        </p>
      </div>

      {/* Summary stats */}
      <div className="flex gap-4">
        <StatBox label="Mode" value={mode} />
        <StatBox label="Components" value={String(selectedComps.length + (hasMcp ? 1 : 0))} />
        <StatBox label="Files" value={String(totalFiles)} />
        <StatBox label="Backup" value={backup && detection.existingManifest ? 'Yes' : 'No'} />
      </div>

      {/* Project path */}
      {mode === 'project' && projectPath && (
        <div className="flex gap-2 items-center text-[11px]">
          <span className="font-semibold text-text-secondary">Project:</span>
          <span className="font-mono text-text-tertiary">{projectPath}</span>
        </div>
      )}

      {/* Component table */}
      <div className="rounded-[var(--radius-md)] border border-border overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="text-left text-[9px] font-semibold uppercase tracking-[0.05em] text-text-tertiary px-3 py-[6px] bg-bg-secondary border-b border-border">
                Component
              </th>
              <th className="text-left text-[9px] font-semibold uppercase tracking-[0.05em] text-text-tertiary px-3 py-[6px] bg-bg-secondary border-b border-border">
                Target
              </th>
              <th className="text-right text-[9px] font-semibold uppercase tracking-[0.05em] text-text-tertiary px-3 py-[6px] bg-bg-secondary border-b border-border w-[60px]">
                Files
              </th>
            </tr>
          </thead>
          <tbody>
            {selectedComps.map((comp) => (
              <tr key={comp.id}>
                <td className="px-3 py-2 border-b border-border-divider text-[11px] font-semibold text-text-primary">
                  {comp.label}
                </td>
                <td className="px-3 py-2 border-b border-border-divider text-[10px] font-mono text-text-tertiary max-w-[250px] truncate" title={comp.targetDir}>
                  {comp.targetDir.replace(/\\/g, '/').replace(/^.*\/\./, '~\/.')}
                </td>
                <td className="px-3 py-2 border-b border-border-divider text-[11px] font-mono text-text-secondary text-right">
                  {comp.fileCount}
                </td>
              </tr>
            ))}
            {hasMcp && (
              <tr>
                <td className="px-3 py-2 border-b border-border-divider text-[11px] font-semibold text-text-primary">
                  MCP Server
                </td>
                <td className="px-3 py-2 border-b border-border-divider text-[10px] font-mono text-text-tertiary">
                  {mode === 'project' ? '.mcp.json' : '~/.claude.json'}
                </td>
                <td className="px-3 py-2 border-b border-border-divider text-[11px] font-mono text-text-secondary text-right">
                  —
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* MCP config preview */}
      {hasMcp && mcpEnabled && (
        <div className="rounded-[var(--radius-md)] border border-border bg-bg-card px-4 py-3">
          <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-[0.04em] mb-1">
            MCP Tools
          </p>
          <div className="flex flex-wrap gap-1">
            {Array.from(enabledTools).map((tool) => (
              <span
                key={tool}
                className="text-[9px] font-mono font-semibold px-[7px] py-[2px] rounded-full bg-[rgba(90,158,120,0.08)] text-[var(--color-status-completed,#5A9E78)]"
              >
                {tool}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={() => setStep('configure')}
          className="px-4 py-[7px] rounded-[var(--radius-lg)] border border-border bg-bg-card text-[12px] font-semibold text-text-secondary hover:text-text-primary hover:border-text-tertiary transition-all cursor-pointer"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => void install()}
          className="px-5 py-[8px] rounded-[var(--radius-lg)] border-none bg-[var(--color-status-completed,#5A9E78)] text-white text-[12px] font-semibold cursor-pointer transition-all hover:-translate-y-px hover:shadow-md"
        >
          Install
        </button>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded-[var(--radius-md)] border border-border bg-bg-card px-3 py-2 text-center">
      <div className="text-[14px] font-extrabold text-text-primary font-mono capitalize">{value}</div>
      <div className="text-[9px] font-semibold text-text-tertiary uppercase tracking-[0.04em]">{label}</div>
    </div>
  );
}
