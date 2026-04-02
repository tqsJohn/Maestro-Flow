import React from 'react';
import { render } from 'ink';
import { App } from './App.js';

// ---------------------------------------------------------------------------
// Entry point — fullscreen alt-screen TUI
// ---------------------------------------------------------------------------

const { waitUntilExit, unmount } = render(<App />, {
  exitOnCtrlC: true,
});

// Cleanup on exit signals
function cleanup() {
  unmount();
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

await waitUntilExit();
