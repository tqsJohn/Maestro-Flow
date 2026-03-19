# CLI Tools Execution Specification

<purpose>
Unified reference for `maestro cli` — the CLI agent command that runs agent tools (gemini, qwen, codex, claude, opencode) with a shared interface for prompt, mode, model, working directory, templates, and session resume.
</purpose>

<required_reading>
- `~/.maestro/cli-tools.json` — tool configuration (enabled, models, tags, type)
- `~/.maestro/templates/cli/` — protocol and prompt templates
</required_reading>

---

## Configuration Reference

<context>
**Config path**: `~/.maestro/cli-tools.json`

All tool availability, model selection, and routing are defined in this configuration file.

### Configuration Fields

| Field | Description |
|-------|-------------|
| `enabled` | Tool availability status |
| `primaryModel` | Default model for the tool |
| `secondaryModel` | Fallback model |
| `tags` | Capability tags for routing |
| `type` | Tool type (`builtin` / `cli-wrapper` / `api-endpoint`) |

### Tool Types

| Type | Usage | Capabilities |
|------|-------|--------------|
| `builtin` | `--tool gemini` | Full (analysis + write tools) |
| `cli-wrapper` | `--tool doubao` | Full (analysis + write tools) |
| `api-endpoint` | `--tool g25` | **Analysis only** (no file write tools) |

> **Note**: `api-endpoint` tools only support analysis and code generation responses. They cannot create, modify, or delete files.

### Supported Tools

| Tool | Agent Type | Adapter |
|------|-----------|---------|
| `gemini` | gemini | StreamJsonAdapter (`npx -y @google/gemini-cli`) |
| `qwen` | qwen | StreamJsonAdapter (`qwen`) |
| `codex` | codex | CodexCliAdapter |
| `claude` | claude-code | ClaudeCodeAdapter |
| `opencode` | opencode | OpenCodeAdapter |
</context>

---

## Tool Selection

<execution>

### Tag-Based Routing

Tools are selected based on **tags** defined in the configuration. Use tags to match task requirements to tool capabilities.

#### Common Tags

| Tag | Use Case |
|-----|----------|
| `analysis` | Code review, architecture analysis, exploration |
| `implementation` | Feature development, bug fixes |
| `documentation` | Doc generation, comments |
| `testing` | Test creation, coverage analysis |
| `refactoring` | Code restructuring |
| `security` | Security audits, vulnerability scanning |

### Selection Algorithm

```
1. Explicit --tool specified? → Use it (validate enabled)
2. No explicit tool → First enabled tool in config order
```

> Tag-based auto-selection is resolved at invocation time by the caller. `selectTool()` in `cli-tools-config.ts` does exact-name match or first-enabled fallback.

### Command Structure

```bash
# Explicit tool selection
maestro cli -p "<PROMPT>" --tool <tool-id> --mode <analysis|write>

# Model override
maestro cli -p "<PROMPT>" --tool <tool-id> --model <model-id> --mode <analysis|write>

# Tag-based auto-selection (future)
maestro cli -p "<PROMPT>" --tags <tag1,tag2> --mode <analysis|write>
```

### Tool Fallback Chain

When primary tool fails or is unavailable:
1. Check `secondaryModel` for same tool
2. Try next enabled tool with matching tags
3. Fall back to default enabled tool (first enabled in config)
</execution>

---

## Prompt Template

<context>
### Universal Prompt Template

```bash
maestro cli -p "PURPOSE: [what] + [why] + [success criteria] + [constraints/scope]
TASK: [step 1] [step 2] [step 3]
MODE: [analysis|write]
CONTEXT: @[file patterns] | Memory: [session/tech/module context]
EXPECTED: [deliverable format] + [quality criteria] + [structure requirements]
CONSTRAINTS: [domain constraints]" --tool <tool-id> --mode <analysis|write> --rule <category-template>
```

### Intent Capture Checklist (Before CLI Execution)

Before executing any CLI command, verify these intent dimensions:

- [ ] Is the objective specific and measurable?
- [ ] Are success criteria defined?
- [ ] Is the scope clearly bounded?
- [ ] Are constraints and limitations stated?
- [ ] Is the expected output format clear?
- [ ] Is the action level (read/write) explicit?

### Template Structure

Every command MUST include these fields:

| Field | Purpose | Components | Bad Example | Good Example |
|-------|---------|------------|-------------|--------------|
| **PURPOSE** | Goal + motivation + success | What + Why + Success Criteria + Constraints | "Analyze code" | "Identify security vulnerabilities in auth module to pass compliance audit; success = all OWASP Top 10 addressed; scope = src/auth/** only" |
| **TASK** | Actionable steps | Specific verbs + targets | "Review code, Find issues" | "Scan for SQL injection in query builders, Check XSS in template rendering, Verify CSRF token validation" |
| **MODE** | Permission level | analysis / write | (missing) | "analysis" or "write" |
| **CONTEXT** | File scope + history | File patterns + Memory | "@\*\*/\*" | "@src/auth/\*\*/\*.ts @shared/utils/security.ts \| Memory: Previous auth refactoring" |
| **EXPECTED** | Output specification | Format + Quality + Structure | "Report" | "Markdown report with: severity levels (Critical/High/Medium/Low), file:line references, remediation code snippets" |
| **CONSTRAINTS** | Domain-specific constraints | Scope limits, special requirements | (missing or too vague) | "Focus on authentication \| Ignore test files \| No breaking changes" |

### CONTEXT Configuration

**Format**: `CONTEXT: [file patterns] | Memory: [memory context]`

#### File Patterns

- **`@**/*`**: All files (default)
- **`@src/**/*.ts`**: TypeScript in src
- **`@../shared/**/*`**: Sibling directory (requires `--includeDirs`)
- **`@CLAUDE.md`**: Specific file

#### Memory Context

Include when building on previous work:

```bash
# Cross-task reference
Memory: Building on auth refactoring (commit abc123), implementing refresh tokens

# Cross-module integration
Memory: Integration with auth module, using shared error patterns from @shared/utils/errors.ts
```

**Memory Sources**:
- **Related Tasks**: Previous refactoring, extensions, conflict resolution
- **Tech Stack Patterns**: Framework conventions, security guidelines
- **Cross-Module References**: Integration points, shared utilities, type dependencies

#### Pattern Discovery Workflow

For complex requirements, discover files BEFORE CLI execution:

```bash
# Step 1: Discover files
mcp__ace-tool__search_context(project_root_path="/path", query="React components with export")

# Step 2: Build CONTEXT
CONTEXT: @components/Auth.tsx @types/auth.d.ts | Memory: Previous type refactoring

# Step 3: Execute CLI
maestro cli -p "..." --tool <tool-id> --mode analysis --cd "src"
```
</context>

---

## --rule Configuration

<context>
### Protocol + Template Assembly

`maestro cli` assembles the final prompt in order:
1. **Mode protocol** — loaded from `~/.maestro/templates/cli/protocols/{mode}-protocol.md`
2. **User prompt** — the `-p` value
3. **Rule template** — loaded from `~/.maestro/templates/cli/prompts/{rule}.txt`

```bash
maestro cli -p "..." --tool gemini --mode analysis --rule analysis-review-architecture
```

### Mode Protocol References

- `--mode analysis` → `analysis-protocol.md` (read-only)
- `--mode write` → `write-protocol.md` (create/modify/delete files)

### Available `--rule` Template Names

**Universal**:
- `universal-rigorous-style` — Precise tasks
- `universal-creative-style` — Exploratory tasks

**Analysis**:
- `analysis-trace-code-execution` — Execution tracing
- `analysis-diagnose-bug-root-cause` — Bug diagnosis
- `analysis-analyze-code-patterns` — Code patterns
- `analysis-analyze-technical-document` — Document analysis
- `analysis-review-architecture` — Architecture review
- `analysis-review-code-quality` — Code review
- `analysis-analyze-performance` — Performance analysis
- `analysis-assess-security-risks` — Security assessment

**Planning**:
- `planning-plan-architecture-design` — Architecture design
- `planning-breakdown-task-steps` — Task breakdown
- `planning-design-component-spec` — Component design
- `planning-plan-migration-strategy` — Migration strategy

**Development**:
- `development-implement-feature` — Feature implementation
- `development-refactor-codebase` — Code refactoring
- `development-generate-tests` — Test generation
- `development-implement-component-ui` — UI component
- `development-debug-runtime-issues` — Runtime debugging
</context>

---

## CLI Execution

<execution>

### MODE Options

| Mode | Permission | Use For |
|------|-----------|---------|
| `analysis` | Read-only | Code review, architecture analysis, pattern discovery, exploration |
| `write` | Create/Modify/Delete | Feature implementation, bug fixes, documentation, code creation |

> Only `analysis` and `write` are supported. Mode defaults to `analysis` if not specified.

### Command Options

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --prompt <prompt>` | **Required**. Prompt to send to the agent | — |
| `--tool <name>` | CLI tool to use (gemini, qwen, codex, claude, opencode) | First enabled tool in config |
| `--mode <mode>` | Execution mode: `analysis` or `write` | `analysis` |
| `--model <model>` | Model override | Tool's `primaryModel` from config |
| `--cd <dir>` | Working directory (quote if path contains spaces) | Current directory |
| `--rule <template>` | Template name — auto-loads protocol + template appended to prompt | — |
| `--id <id>` | Execution ID (auto-generated if omitted) | `{prefix}-{HHmmss}-{rand4}` (e.g., `gem-143022-a7f2`) |
| `--resume [id]` | Resume previous session (last if no id) | — |
| `--includeDirs <dirs>` | Additional directories (comma-separated) | — |

**Execution ID prefix mapping**: gemini→`gem`, qwen→`qwn`, codex→`cdx`, claude→`cld`, opencode→`opc`

ID is always output to stderr as `[MAESTRO_EXEC_ID=<id>]` for programmatic capture.

### Directory Configuration

#### Working Directory (`--cd`)

When using `--cd`:
- `@**/*` = Files within working directory tree only
- CANNOT reference parent/sibling via `@` alone
- Must use `--includeDirs` for external directories

#### Include Directories (`--includeDirs`)

**TWO-STEP requirement for external files**:
1. Add `--includeDirs` parameter
2. Reference in CONTEXT with `@` patterns

```bash
# Single directory
maestro cli -p "CONTEXT: @**/* @../shared/**/*" --tool gemini --mode analysis --cd "src/auth" --includeDirs "../shared"

# Multiple directories
maestro cli -p "..." --tool gemini --mode analysis --cd "src/auth" --includeDirs "../shared,../types,../utils"
```

**Rule**: If CONTEXT contains `@../dir/**/*`, MUST include `--includeDirs ../dir`

### Session Resume

**When to Use**:
- Multi-round planning (analysis → planning → implementation)
- Multi-model collaboration (tool A → tool B on same topic)
- Topic continuity (building on previous findings)

**Usage**:

```bash
maestro cli -p "Continue analyzing" --tool gemini --mode analysis --resume              # Resume last
maestro cli -p "Fix issues found" --tool gemini --mode write --resume <id>              # Resume specific
maestro cli -p "Merge findings" --tool gemini --mode analysis --resume <id1>,<id2>      # Merge multiple (comma-separated)
```

**Context Assembly** (automatic via `CliHistoryStore.buildResumePrompt`):
```
=== PREVIOUS CONVERSATION ===
Tool: gemini | Mode: analysis

[assistant messages, tool results, file changes, command outputs, errors]

=== NEW REQUEST ===
[Your new prompt]
```

> Warning is emitted when resume context exceeds 32KB.

### Subcommands

#### `show` — List Recent Executions

```bash
maestro cli show                 # Recent 20 executions
maestro cli show --all           # Up to 100 executions
```

Displays table with: ID, Tool, Mode, Status (`running`/`done`/`exit:N`), Prompt preview.

#### `output <id>` — Get Execution Output

```bash
maestro cli output <id>              # Final assistant output only
maestro cli output <id> --verbose    # Full metadata (ID, Tool, Mode, Status, Start, End) + output
```

Default returns concatenated non-partial `assistant_message` entries from the JSONL history.

#### ID Workflow Example

```bash
# Execute with auto-generated ID
maestro cli -p "analyze code" --tool gemini --mode analysis
# stderr: [MAESTRO_EXEC_ID=gem-143022-a7f2]

# Execute with custom ID
maestro cli -p "implement feature" --tool gemini --mode write --id my-task-1
# stderr: [MAESTRO_EXEC_ID=my-task-1]

# Check status
maestro cli show

# Get final result
maestro cli output gem-143022-a7f2

# Capture ID programmatically
EXEC_ID=$(maestro cli -p "test" --tool gemini --mode analysis 2>&1 | grep -oP 'MAESTRO_EXEC_ID=\K[^\]]+')
maestro cli output $EXEC_ID
```
</execution>

---

## Command Examples

<context>

### Analysis Task (Security Audit)

```bash
maestro cli -p "PURPOSE: Identify OWASP Top 10 vulnerabilities in authentication module to pass security audit; success = all critical/high issues documented with remediation
TASK: Scan for injection flaws (SQL, command, LDAP) | Check authentication bypass vectors | Evaluate session management | Assess sensitive data exposure
MODE: analysis
CONTEXT: @src/auth/**/* @src/middleware/auth.ts | Memory: Using bcrypt for passwords, JWT for sessions
EXPECTED: Security report with: severity matrix, file:line references, CVE mappings where applicable, remediation code snippets prioritized by risk
CONSTRAINTS: Focus on authentication | Ignore test files
" --tool gemini --mode analysis --rule analysis-assess-security-risks --cd "src/auth"
```

### Implementation Task (New Feature)

```bash
maestro cli -p "PURPOSE: Implement rate limiting for API endpoints to prevent abuse; must be configurable per-endpoint; backward compatible with existing clients
TASK: Create rate limiter middleware with sliding window | Implement per-route configuration | Add Redis backend for distributed state | Include bypass for internal services
MODE: write
CONTEXT: @src/middleware/**/* @src/config/**/* | Memory: Using Express.js, Redis already configured, existing middleware pattern in auth.ts
EXPECTED: Production-ready code with: TypeScript types, unit tests, integration test, configuration example, migration guide
CONSTRAINTS: Follow existing middleware patterns | No breaking changes
" --tool gemini --mode write --rule development-implement-feature
```

### Bug Fix Task

```bash
maestro cli -p "PURPOSE: Fix memory leak in WebSocket connection handler causing server OOM after 24h; root cause must be identified before any fix
TASK: Trace connection lifecycle from open to close | Identify event listener accumulation | Check cleanup on disconnect | Verify garbage collection eligibility
MODE: analysis
CONTEXT: @src/websocket/**/* @src/services/connection-manager.ts | Memory: Using ws library, ~5000 concurrent connections in production
EXPECTED: Root cause analysis with: memory profile, leak source (file:line), fix recommendation with code, verification steps
CONSTRAINTS: Focus on resource cleanup
" --tool gemini --mode analysis --rule analysis-diagnose-bug-root-cause --cd "src"
```

### Refactoring Task

```bash
maestro cli -p "PURPOSE: Refactor payment processing to use strategy pattern for multi-gateway support; no functional changes; all existing tests must pass
TASK: Extract gateway interface from current implementation | Create strategy classes for Stripe, PayPal | Implement factory for gateway selection | Migrate existing code to use strategies
MODE: write
CONTEXT: @src/payments/**/* @src/types/payment.ts | Memory: Currently only Stripe, adding PayPal next sprint, must support future gateways
EXPECTED: Refactored code with: strategy interface, concrete implementations, factory class, updated tests, migration checklist
CONSTRAINTS: Preserve all existing behavior | Tests must pass
" --tool gemini --mode write --rule development-refactor-codebase
```
</context>

---

## Permission Framework

<context>
**Single-Use Authorization**: Each execution requires explicit user instruction. Previous authorization does NOT carry over.

**Mode Hierarchy**:
- `analysis`: Read-only, safe for auto-execution. `approvalMode` = `suggest`
- `write`: Create/Modify/Delete files, full operations. `approvalMode` = `auto`
- **Exception**: User provides clear instructions like "modify", "create", "implement"
</context>

---

## Auto-Invoke Triggers

<execution>
**Proactive CLI invocation** — Auto-invoke `maestro cli` when encountering these scenarios:

| Trigger Condition | Suggested Rule | When to Use |
|-------------------|----------------|-------------|
| **Self-repair fails** | `analysis-diagnose-bug-root-cause` | After 1+ failed fix attempts |
| **Ambiguous requirements** | `planning-breakdown-task-steps` | Task description lacks clarity |
| **Architecture decisions** | `planning-plan-architecture-design` | Complex feature needs design |
| **Pattern uncertainty** | `analysis-analyze-code-patterns` | Unsure of existing conventions |
| **Critical code paths** | `analysis-assess-security-risks` | Security/performance sensitive |

### Execution Principles

- **Default mode**: `--mode analysis` (read-only, safe for auto-execution)
- **No confirmation needed**: Invoke proactively when triggers match
- **Wait for results**: Complete analysis before next action
- **Tool selection**: Use context-appropriate tool or fallback chain (`gemini` → `qwen` → `codex`)
- **Rule flexibility**: Suggested rules are guidelines — choose the most appropriate template

### Example: Bug Fix with Auto-Invoke

```bash
maestro cli -p "PURPOSE: Identify root cause of [bug description]; success = actionable fix strategy
TASK: Trace execution flow | Identify failure point | Analyze state at failure | Determine fix approach
MODE: analysis
CONTEXT: @src/module/**/* | Memory: Previous fix attempts failed at [location]
EXPECTED: Root cause analysis with: failure mechanism, stack trace interpretation, fix recommendation with code
CONSTRAINTS: Focus on [specific area]
" --tool gemini --mode analysis --rule analysis-diagnose-bug-root-cause
```
</execution>

---

## Best Practices

<success_criteria>
- [ ] **Purpose defined** — Clear goal and intent in PURPOSE field
- [ ] **Mode selected** — `--mode analysis` or `--mode write` explicitly set
- [ ] **Context gathered** — File references + memory (default `@**/*`)
- [ ] **Directory navigation** — `--cd` and/or `--includeDirs` when needed
- [ ] **Tool selected** — Explicit `--tool` or rely on first-enabled fallback
- [ ] **Rule template** — `--rule <template-name>` loads protocol + template
- [ ] **Constraints** — Domain constraints in CONSTRAINTS field
- [ ] **Configuration-driven** — All tool selection from `~/.maestro/cli-tools.json`
- [ ] **Wait for results** — Complete analysis before write actions
- [ ] **Discover patterns first** — Use search tools before CLI execution for complex tasks
</success_criteria>

<error_codes>
| Code | Severity | Description |
|------|----------|-------------|
| E001 | error | Required option `-p, --prompt <prompt>` not specified |
| E002 | error | Invalid mode (not `analysis` or `write`) |
| E003 | error | Unknown tool (not in TOOL_TO_AGENT_TYPE mapping) |
| E004 | error | No previous execution found for `--resume` |
| W001 | warning | Template not found for `--rule`, proceeding without it |
| W002 | warning | Resume context exceeds 32KB, may exceed model context limit |
| W003 | warning | Config file `~/.maestro/cli-tools.json` not found, using empty defaults |
</error_codes>
