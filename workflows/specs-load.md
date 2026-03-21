# Workflow: specs-load

Load spec files from `.workflow/specs/`, filtered by category.

## Arguments

```
$ARGUMENTS: "[--category <type>] [keyword]"

--category  -- filter by category:
               general | planning | execution | debug | test | review | validation
keyword     -- optional, grep within loaded specs for matching sections
```

## Category → Files Mapping

Categories are resolved by **filename** (no frontmatter required):

| Category | Files loaded |
|----------|-------------|
| `execution` | `coding-conventions.md`, `architecture-constraints.md`, `quality-rules.md`, `learnings.md` |
| `planning` | `architecture-constraints.md`, `learnings.md` |
| `validation` | `validation-rules.md`, `learnings.md` |
| `test` | `test-conventions.md`, `learnings.md` |
| `review` | `review-standards.md`, `learnings.md` |
| `debug` | `debug-notes.md`, `learnings.md` |
| `general` | `learnings.md` + any unknown files |
| _(no filter)_ | All `.md` files in specs/ |

`learnings.md` is always included regardless of category filter.

## Execution Steps

### Step 1: Parse Arguments

```
Parse $ARGUMENTS:
  --category <type>  -> category filter
  remaining text     -> keyword for grep filtering
```

### Step 2: Load Specs via CLI

```bash
maestro spec load --category <category>
```

If `maestro spec load` CLI is unavailable, read files directly:
```bash
cat .workflow/specs/<matched-files>
```

### Step 3: Keyword Filter (optional)

If keyword provided, grep within loaded content:
```bash
grep -n -i -C 3 "$KEYWORD" <loaded content>
```

### Step 4: Display Results

Output loaded specs content. If no specs found, show:
```
(No specs found. Run "maestro spec init" or "/spec-setup" to initialize.)
```
