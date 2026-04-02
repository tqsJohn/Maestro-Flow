import React from 'react';
import { Box, Text } from 'ink';
import { type ViewId, routes } from '../router/types.js';

interface HeaderBarProps {
  activeView: ViewId;
}

export function HeaderBar({ activeView }: HeaderBarProps) {
  return (
    <Box borderStyle="single" borderBottom borderLeft={false} borderRight={false} borderTop={false} paddingX={1}>
      <Text bold color="green">Maestro TUI</Text>
      <Text> | </Text>
      {routes.map((route) => (
        <Box key={route.id} marginRight={1}>
          <Text
            bold={route.id === activeView}
            color={route.id === activeView ? 'cyan' : undefined}
            dimColor={route.id !== activeView}
          >
            [{route.key}] {route.label}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
