import React from 'react';
import { Box, Text } from 'ink';

// ---------------------------------------------------------------------------
// DataTable — typed column-based table with header and row rendering
// ---------------------------------------------------------------------------

export interface Column<T> {
  /** Property key to extract from row data */
  key: keyof T & string;
  /** Display label for header */
  label: string;
  /** Fixed character width for the column */
  width: number;
  /** Optional custom renderer */
  render?: (value: T[keyof T], row: T) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  /** Index of selected row (for highlight) */
  selectedIndex?: number;
}

export function DataTable<T>({ columns, data, selectedIndex }: DataTableProps<T>) {
  return (
    <Box flexDirection="column">
      {/* Header row */}
      <Box>
        {columns.map((col) => (
          <Box key={col.key} width={col.width} flexShrink={0}>
            <Text bold underline wrap="truncate">
              {col.label}
            </Text>
          </Box>
        ))}
      </Box>

      {/* Data rows */}
      {data.map((row, rowIndex) => {
        const isSelected = rowIndex === selectedIndex;
        return (
          <Box key={rowIndex}>
            {columns.map((col) => (
              <Box key={col.key} width={col.width} flexShrink={0}>
                {col.render ? (
                  col.render(row[col.key], row)
                ) : (
                  <Text
                    color={isSelected ? 'cyan' : undefined}
                    wrap="truncate"
                  >
                    {String(row[col.key] ?? '')}
                  </Text>
                )}
              </Box>
            ))}
          </Box>
        );
      })}

      {data.length === 0 && (
        <Box>
          <Text dimColor>(no data)</Text>
        </Box>
      )}
    </Box>
  );
}
