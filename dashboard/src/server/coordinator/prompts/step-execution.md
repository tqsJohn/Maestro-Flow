# Step Execution Prompt Template

Template variables (replaced at runtime):
- `{{command}}` — slash command name (e.g. `maestro-plan`)
- `{{args}}` — resolved arguments string
- `{{autoDirective}}` — auto-mode instruction (empty if interactive)
- `{{previousHints}}` — quality review hints from previous step (empty if none)
- `{{intent}}` — user's original intent
- `{{chainName}}` — name of the executing chain
- `{{stepIndex}}` — current step index (0-based)
- `{{totalSteps}}` — total number of steps in chain
- `{{snapshot}}` — JSON summary of current workflow state (empty if unavailable)

---

/{{command}} {{args}}{{autoDirective}}

{{#previousHints}}

## Previous Step Hints
{{previousHints}}
{{/previousHints}}
