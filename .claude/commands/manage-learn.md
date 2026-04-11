---
name: manage-learn
description: Capture, search, and review atomic learning insights into .workflow/learning/lessons.jsonl
argument-hint: "[<text>|list|search|show <id>] [--category ...] [--tag t1,t2] [--phase N] [--confidence ...]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
---
<purpose>
Atomic insight capture for the workflow learning library. Lightweight gstack-style "eureka moment" log that complements `quality-retrospective`: where retrospective extracts insights from a completed phase in bulk, `manage-learn` captures one timeless insight at a time during active work. Insights are appended to `.workflow/learning/lessons.jsonl` with auto-detected phase linkage and a simple keyword-based category inference. Same store as retrospective output, so search and list see both manual captures and retrospective-distilled insights.
</purpose>

<required_reading>
@~/.maestro/workflows/learn.md
</required_reading>

<context>
Arguments: $ARGUMENTS

**Modes (auto-detected from first token):**
- `"<insight text>"` (or any non-keyword text) → capture mode
- `list` → list recent insights (default 20)
- `search <query>` → text search across lessons.jsonl
- `show <INS-id>` → full insight detail with phase context
- empty → AskUserQuestion to prompt for insight text

**Capture flags:**
- `--category <name>` — pattern | antipattern | decision | tool | gotcha | technique. Default: inferred from text via keyword heuristics.
- `--tag t1,t2` — comma-separated tags. Always implicitly adds `manual`.
- `--phase <N>` — override auto-detected current phase. Use `--phase 0` to force "no phase".
- `--confidence <level>` — high | medium | low. Default: medium.

**List/search flags:**
- `--tag t1,t2` — filter by tag
- `--category <name>` — filter by category
- `--phase <N>` — filter by phase
- `--lens <name>` — filter by retrospective lens (technical | process | quality | decision)
- `--limit <N>` — list mode row limit (default 20)

**Storage:**
- `.workflow/learning/lessons.jsonl` — append-only JSONL row per insight (shared with `quality-retrospective` output)
- `.workflow/learning/learning-index.json` — searchable index (mirrors `memory-index.json` schema)

**Shared store rationale:** Manual captures (`source: "manual"`, `lens: null`) and retrospective-distilled insights (`source: "retrospective"`, `lens: <name>`) live side by side so search and list see the entire knowledge corpus. The `source` and `lens` fields disambiguate.
</context>

<execution>
Follow `~/.maestro/workflows/learn.md` Stages 1–5 in order. Key invariants:

1. **No agent or CLI calls** — this is a pure file operation: parse → infer → append → confirm. Category inference is keyword-based, not LLM-based.
2. **Auto-link phase** — read `.workflow/state.json` for `current_phase` and resolve the matching directory slug. `--phase 0` forces no link.
3. **Match memory-index pattern** — `learning-index.json` schema mirrors `memory-index.json` from `workflows/memory.md` (entries[] with id, type, timestamp, file, summary, tags, plus learn-specific fields: lens, category, phase, phase_slug, confidence, routed_to, routed_id).
4. **Stable INS ids** — `INS-{8 lowercase hex}` from `hash(insight_text + timestamp)`.
5. **Append-only lessons.jsonl** — never rewrite existing rows; duplicate detection is the user's job at search time.
6. **Bootstrap on demand** — create `.workflow/learning/`, `lessons.jsonl`, `learning-index.json` on first use; do not require them to exist upfront.
</execution>

<error_codes>
| Code | Severity | Description | Stage |
|------|----------|-------------|-------|
| E001 | error | `.workflow/` not initialized — run `Skill({ skill: "maestro-init" })` first | parse_input |
| E002 | error | Unknown `--category` value (allowed: pattern, antipattern, decision, tool, gotcha, technique) | parse_input |
| E003 | error | `show` mode requires an INS-id argument | show |
| E004 | error | Insight id not found in lessons.jsonl | show |
| W001 | warning | Auto-phase detection found a current_phase but no matching directory; phase set to null | capture |
| W002 | warning | learning-index.json out of sync with lessons.jsonl (different row count); offer to rebuild | list/search |
</error_codes>

<success_criteria>
- [ ] Mode correctly routed (capture / list / search / show)
- [ ] Capture: `lessons.jsonl` row appended with valid JSON and all required fields
- [ ] Capture: `learning-index.json` updated with matching entry
- [ ] Capture: phase auto-link resolves correctly when `state.json` has `current_phase`
- [ ] Capture: category inference produces a sensible default when `--category` absent
- [ ] List: filters apply, output sorted newest-first, default limit 20
- [ ] Search: results ranked by title (3) > tags (2) > summary (1) match
- [ ] Show: full insight displayed with phase context and routed-artifact link if any
- [ ] No file modifications outside `.workflow/learning/`
- [ ] Confirmation banner displayed with INS-id and next-step hints
- [ ] Next step: `Skill({ skill: "manage-learn", args: "list" })` to browse, or `Skill({ skill: "manage-learn", args: "search <query>" })` to find related insights
</success_criteria>
