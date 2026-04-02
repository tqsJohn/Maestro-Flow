import React, { useState } from 'react';
import { Box, useInput } from 'ink';
import { ApiProvider } from './providers/ApiProvider.js';
import { WsProvider, useWs } from './providers/WsProvider.js';
import { HeaderBar } from './layout/HeaderBar.js';
import { StatusBar } from './layout/StatusBar.js';
import { Router } from './router/Router.js';
import { type ViewId, routes } from './router/types.js';

// ---------------------------------------------------------------------------
// AppContent — uses provider context, manages view state
// ---------------------------------------------------------------------------

function AppContent() {
  const [activeView, setActiveView] = useState<ViewId>('issue');
  const { connected } = useWs();

  useInput((input, key) => {
    if (input === 'q' && !key.ctrl) {
      process.exit(0);
    }
    const route = routes.find((r) => r.key === input);
    if (route) {
      setActiveView(route.id);
    }
  });

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <HeaderBar activeView={activeView} />
      <Box flexGrow={1}>
        <Router activeView={activeView} />
      </Box>
      <StatusBar connected={connected} workspace={process.cwd()} />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// App — root component with providers
// ---------------------------------------------------------------------------

export function App() {
  const port = process.env.PORT || '3001';
  const host = process.env.HOST || 'localhost';
  const baseUrl = `http://${host}:${port}`;
  const wsUrl = `ws://${host}:${port}/ws`;

  return (
    <ApiProvider baseUrl={baseUrl}>
      <WsProvider url={wsUrl}>
        <AppContent />
      </WsProvider>
    </ApiProvider>
  );
}
