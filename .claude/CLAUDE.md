# Maestro

Workflow orchestration CLI with MCP endpoint support and extensible architecture.

- **Coding Philosophy**: @~/.maestro/workflows/coding-philosophy.md

## Delegate & CLI

- **Delegate Usage**: @~/.maestro/workflows/delegate-usage.md
- **CLI Endpoints Config**: @~/.maestro/cli-tools.json

**Strictly follow the cli-tools.json configuration**

Available CLI endpoints are dynamically defined by the config file

## Code Diagnostics

- **Prefer `mcp__ide__getDiagnostics`** for code error checking over shell-based TypeScript compilation

