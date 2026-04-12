import { useState } from 'react';
import type { CollabAggregatedActivity } from '@/shared/collab-types.js';

// ---------------------------------------------------------------------------
// HeatmapCell — individual SVG rect for the conflict heatmap
// ---------------------------------------------------------------------------

interface HeatmapCellProps {
  cell: CollabAggregatedActivity;
  x: number;
  y: number;
  width: number;
  height: number;
  onClick: (cell: CollabAggregatedActivity) => void;
}

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

function getHoverColor(risk: string): string {
  switch (risk) {
    case 'high':
      return '#fecaca';
    case 'medium':
      return '#fef08a';
    case 'low':
      return '#d9f99d';
    default:
      return '#dcfce7';
  }
}

export function HeatmapCell({ cell, x, y, width, height, onClick }: HeatmapCellProps) {
  const [hovered, setHovered] = useState(false);

  const fill = hovered ? getHoverColor(cell.risk) : getColorForRisk(cell.risk);
  const stroke = hovered ? '#6b7280' : 'none';
  const strokeWidth = hovered ? 1.5 : 0;

  const tooltipText = [
    `Phase: ${cell.phase}`,
    `Task: ${cell.task}`,
    `Activity count: ${cell.count}`,
    `Members: ${cell.members.join(', ')}`,
  ].join('\n');

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={4}
        ry={4}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        style={{ cursor: 'pointer', transition: 'fill 0.15s, stroke 0.15s' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => onClick(cell)}
      />
      <title>{tooltipText}</title>
      {cell.count > 0 && (
        <text
          x={x + width / 2}
          y={y + height / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={11}
          fontFamily="var(--font-family-mono, monospace)"
          fill={cell.risk === 'high' ? '#7f1d1d' : '#374151'}
          style={{ pointerEvents: 'none' }}
        >
          {cell.count}
        </text>
      )}
    </g>
  );
}
