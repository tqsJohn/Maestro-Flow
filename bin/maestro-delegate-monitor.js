#!/usr/bin/env node
const { runDelegateMonitor } = await import('../dist/hooks/delegate-monitor.js');
runDelegateMonitor();
