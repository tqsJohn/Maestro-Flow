---
name: maestro-overlay
description: Create or edit a non-invasive overlay that augments existing slash commands based on natural-language intent
argument-hint: "<intent> | --list | --remove <name>"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
---
<purpose>
Turn a user's natural-language instruction into a command overlay — a JSON patch file that augments one or more `.claude/commands/*.md` files non-invasively. Overlays live at `~/.maestro/overlays/` and are auto-applied by every `maestro install` run, so injected steps survive reinstalls. Use this skill when the user says things like "always run CLI verification after `/maestro-execute`", "require reading doc X before `/maestro-plan`", or "add a `ccw cli` quality check at the end of every quality-review".
</purpose>

<required_reading>
@~/.maestro/workflows/overlays.md
@~/.maestro/cli-tools.json
</required_reading>

<context>
**Overlay model** — an overlay is a JSON file with a `name`, one or more `targets` (command names without `.md`), and a list of `patches`. Each patch targets an XML section (`execution`, `required_reading`, `context`, `success_criteria`, etc.), a mode (`append`, `prepend`, `replace`, `new-section`), and `content`. On apply, the patcher wraps the content in hashed HTML-comment markers so re-apply is idempotent and removal is surgical.

**Where overlays live**
- User overlays: `~/.maestro/overlays/*.json` — created by this skill
- Shared docs: `~/.maestro/overlays/docs/*.md` — referenced via `@~/.maestro/overlays/docs/*.md` inside patch content
- Shipped examples: `~/.maestro/overlays/_shipped/` — read-only, do not edit

**Flags**
- `--list` — show installed overlays and their applied state via `maestro overlay list`
- `--remove <name>` — strip an overlay from targets and delete its file via `maestro overlay remove`

**Available sections** (for `section:` in patches): `purpose`, `required_reading`, `deferred_reading`, `context`, `execution`, `error_codes`, `success_criteria`.
</context>

<execution>
### 1. Parse user intent

If the user passed `--list`, run `maestro overlay list` and stop.
If the user passed `--remove <name>`, run `maestro overlay remove <name>` and stop.

Otherwise treat the argument as natural-language intent. If unclear, ask up to 2 questions with AskUserQuestion: (a) which command(s) to target, (b) where in the command flow the injection should happen.

### 2. Identify targets and injection points

For each likely target command, read the pristine source from `$PKG_ROOT/.claude/commands/<name>.md` (preferred — untouched by overlays) or fall back to `~/.claude/commands/<name>.md`. Inspect the XML sections and pick the right one:

- **New step after execution** → `section: execution`, `mode: append`
- **Required reading** → `section: required_reading`, `mode: append`
- **Preconditions / gating** → `section: context`, `mode: append`
- **Output quality gate** → `section: success_criteria`, `mode: append`

If the user wants a whole new section, use `mode: new-section` with `afterSection: execution` (or whichever anchor makes sense).

### 3. Draft the overlay JSON

Build a slug from the user's intent (kebab-case, lowercase). Write to `~/.maestro/overlays/<slug>.json`:

```json
{
  "name": "<slug>",
  "description": "<short summary of what and why>",
  "targets": ["maestro-execute"],
  "priority": 50,
  "enabled": true,
  "patches": [
    {
      "section": "execution",
      "mode": "append",
      "content": "## CLI Verification (overlay)\n\nAfter execution, run:\n```\nccw cli -p \"PURPOSE: ...\" --mode analysis --rule analysis-review-code-quality\n```"
    }
  ]
}
```

**Content guidelines**
- Lead the injected block with a heading that includes `(overlay)` so readers see it's machine-injected
- Keep content concise — overlays should add a step, not rewrite the command
- `@~/.maestro/...` references are encouraged for pointing at docs
- Escape `\n` in JSON strings; use a HEREDOC via Bash if content is long

### 4. Install via `maestro overlay add`

Run:

```bash
maestro overlay add ~/.maestro/overlays/<slug>.json
```

This validates the overlay, copies it into place (idempotent), and applies it across all known install scopes. On validation failure, fix the JSON and re-run.

### 5. Report

Show the user:
- Path of the saved overlay JSON
- Which targets were patched and which were skipped (missing/disabled)
- A reminder that `maestro install` will auto-reapply on every run
- How to remove: `maestro overlay remove <slug>`

**Report format**

```
=== OVERLAY INSTALLED ===
Name:    <slug>
Path:    ~/.maestro/overlays/<slug>.json
Targets: maestro-execute (applied), maestro-plan (skipped: missing)
Scopes:  [global]

Re-apply: maestro overlay apply
Remove:   maestro overlay remove <slug>
Inspect:  maestro overlay list
```
</execution>

<success_criteria>
- [ ] Overlay JSON written to `~/.maestro/overlays/<slug>.json` and validates
- [ ] `maestro overlay add` exited successfully and applied to at least one scope
- [ ] Target command file(s) contain `<!-- maestro-overlay:<slug>#N hash=... -->` markers
- [ ] Re-running `maestro overlay apply` produces no file changes (idempotent)
- [ ] User shown the report with target list and removal instructions
</success_criteria>
