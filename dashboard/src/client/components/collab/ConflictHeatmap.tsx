import { useState, useMemo } from 'react';
import { useCollabStore } from '@/client/store/collab-store.js';
import type { CollabAggregatedActivity } from '@/shared/collab-types.js';
import { HeatmapCell } from '@/client/components/collab/HeatmapCell.js';

// ---------------------------------------------------------------------------
// ConflictHeatmap — SVG-based phase x task member concentration heatmap
// ---------------------------------------------------------------------------

const CELL_WIDTH = 80;
const CELL_HEIGHT = 40;
const LEFT_MARGIN = 120;
const TOP_MARGIN = 60;
const LEGEND_HEIGHT = 40;
const CELL_GAP = 2;

function getColorForRisk(risk: string): string {
  switch (risk) {
    case 'high':
      return '#fca5a5';
    case 'medium':
      return '#fde047';
    case 'low':
      return '#bbf7d0';
    default:
      return '#f0fdf4';
  }
}

export function ConflictHeatmap() {
  const aggregated = useCollabStore((s) => s.aggregated);
  const loading = useCollabStore((s) => s.loading);

  const [selectedCell, setSelectedCell] = useState<CollabAggregatedActivity | null>(null);

  // Derive unique phases (rows) and tasks (columns)
  const { phases, tasks, cellMap } = useMemo(() => {
    const phaseSet = new Set<string>();
    const taskSet = new Set<string>();
    const map = new Map<string, CollabAggregatedActivity>();

    for (const entry of aggregated) {
      phaseSet.add(entry.phase);
      taskSet.add(entry.task);
      map.set(`${entry.phase}::${entry.task}`, entry);
    }

    return {
      phases: Array.from(phaseSet).sort(),
      tasks: Array.from(taskSet).sort(),
      cellMap: map,
    };
  }, [aggregated]);

  // Dimensions
  const svgWidth = LEFT_MARGIN + tasks.length * CELL_WIDTH + 20;
  const svgHeight = TOP_MARGIN + phases.length * CELL_HEIGHT + LEGEND_HEIGHT + 20;

  // Loading state
  if (loading && aggregated.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-text-secondary text-[length:var(--font-size-sm)]">
        <svg className="animate-spin h-5 w-5 mr-2 text-text-secondary" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading analysis data...
      </div>
    );
  }

  // Empty state
  if (aggregated.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-text-secondary text-[length:var(--font-size-sm)]">
        No activity data available for analysis
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Heatmap */}
      <div className="overflow-auto">
        <svg
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ fontFamily: 'var(--font-family-sans, system-ui, sans-serif)' }}
        >
          {/* Column labels (tasks) — rotated 45 degrees */}
          {tasks.map((task, colIdx) => {
            const cx = LEFT_MARGIN + colIdx * CELL_WIDTH + CELL_WIDTH / 2;
            const cy = TOP_MARGIN - 8;
            return (
              <text
                key={`col-${task}`}
                x={cx}
                y={cy}
                textAnchor="start"
                dominantBaseline="middle"
                fontSize={11}
                fill="var(--color-text-secondary, #6b7280)"
                transform={`rotate(-45, ${cx}, ${cy})`}
              >
                {task}
              </text>
            );
          })}

          {/* Row labels (phases) */}
          {phases.map((phase, rowIdx) => {
            const cy = TOP_MARGIN + rowIdx * CELL_HEIGHT + CELL_HEIGHT / 2;
            return (
              <text
                key={`row-${phase}`}
                x={LEFT_MARGIN - 8}
                y={cy}
                textAnchor="end"
                dominantBaseline="central"
                fontSize={11}
                fill="var(--color-text-secondary, #6b7280)"
              >
                {phase}
              </text>
            );
          })}

          {/* Cells */}
          {phases.map((phase, rowIdx) =>
            tasks.map((task, colIdx) => {
              const cell = cellMap.get(`${phase}::${task}`);
              if (!cell) return null;
              const x = LEFT_MARGIN + colIdx * CELL_WIDTH + CELL_GAP / 2;
              const y = TOP_MARGIN + rowIdx * CELL_HEIGHT + CELL_GAP / 2;
              return (
                <HeatmapCell
                  key={`${phase}-${task}`}
                  cell={cell}
                  x={x}
                  y={y}
                  width={CELL_WIDTH - CELL_GAP}
                  height={CELL_HEIGHT - CELL_GAP}
                  onClick={setSelectedCell}
                />
              );
            }),
          )}

          {/* Color legend */}
          <g transform={`translate(${LEFT_MARGIN}, ${TOP_MARGIN + phases.length * CELL_HEIGHT + 16})`}>
            <text x={0} y={0} fontSize={10} fill="var(--color-text-tertiary, #9ca3af)" dominantBaseline="central">
              Risk level:
            </text>
            {/* Gradient bar */}
            <defs>
              <linearGradient id="risk-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={getColorForRisk('none')} />
                <stop offset="25%" stopColor={getColorForRisk('low')} />
                <stop offset="60%" stopColor={getColorForRisk('medium')} />
                <stop offset="100%" stopColor={getColorForRisk('high')} />
              </linearGradient>
            </defs>
            <rect x={70} y={-8} width={140} height={16} rx={3} fill="url(#risk-gradient)" stroke="#e5e7eb" strokeWidth={0.5} />
            <text x={70} y={18} fontSize={9} fill="var(--color-text-tertiary, #9ca3af)">
              None
            </text>
            <text x={105} y={18} fontSize={9} fill="var(--color-text-tertiary, #9ca3af)">
              Low
            </text>
            <text x={155} y={18} fontSize={9} fill="var(--color-text-tertiary, #9ca3af)">
              Medium
            </text>
            <text x={195} y={18} fontSize={9} fill="var(--color-text-tertiary, #9ca3af)">
              High
            </text>
          </g>
        </svg>
      </div>

      {/* Detail panel */}
      {selectedCell && (
        <div className="border border-border rounded-[var(--radius-md, 6px)] p-4 bg-bg-secondary">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[length:var(--font-size-sm)] font-[var(--font-weight-semibold, 600)] text-text-primary">
              {selectedCell.phase} / {selectedCell.task}
            </h3>
            <button
              type="button"
              onClick={() => setSelectedCell(null)}
              className="text-text-tertiary hover:text-text-secondary text-[length:var(--font-size-xs)] transition-colors"
            >
              Close
            </button>
          </div>
          <div className="flex flex-col gap-1 text-[length:var(--font-size-sm)] text-text-secondary">
            <span>
              Activity count: <strong className="text-text-primary">{selectedCell.count}</strong>
            </span>
            <span>
              Risk level:{' '}
              <strong
                style={{ color: getColorForRisk(selectedCell.risk) === '#f0fdf4' ? '#6b7280' : getColorForRisk(selectedCell.risk) === '#fca5a5' ? '#dc2626' : getColorForRisk(selectedCell.risk) === '#fde047' ? '#ca8a04' : '#16a34a' }}
              >
                {selectedCell.risk}
              </strong>
            </span>
            <div className="mt-1">
              <span className="text-text-tertiary text-[length:var(--font-size-xs)]">Members:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {selectedCell.members.map((name) => (
                  <span
                    key={name}
                    className="px-2 py-0.5 rounded-full text-[length:var(--font-size-xs)] bg-bg-hover text-text-secondary"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
