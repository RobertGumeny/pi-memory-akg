---
name: memory-revert
description: Review and undo auto-captured "unreviewed" memories — dry-run memory_revert, summarize what would be undone, and only revert on user confirmation.
---

Help the user audit and undo auto-captured memories that were written to the
graph without human review (`status: "unreviewed"`, `source: "auto"`). This
happens in headless/orchestrator sessions; the user may want to clean them up.

**Step 1 — Dry run**

Call `memory_revert({})` with no `confirm`. This is a **dry run** — it lists the
unreviewed auto-captured records that would be affected and changes nothing.
Optionally narrow the sweep:

- `memory_revert({ origin: "compaction" })` — only captures from compaction summaries
- `memory_revert({ origin: "branch" })` — only captures from branch summaries
- `memory_revert({ sinceMs: 3600000 })` — only records updated in the last hour

**Step 2 — Summarize for the user**

Show the user exactly what the dry run reported: how many records, and their
titles/ids. Make clear this is a **forward forget**, not a rollback — by default
the records are deactivated (still inspectable), not deleted.

**Step 3 — Confirm, then revert**

Only after the user confirms, re-run with `confirm: true`:

- `memory_revert({ confirm: true })` — deactivate the matched records (default, reversible-friendly)
- `memory_revert({ mode: "delete", confirm: true })` — permanently remove them (cascades edges)

Carry over any `origin` / `sinceMs` narrowing from Step 1 so you revert exactly
what was reviewed. Never call `memory_revert` with `confirm: true` before the
user has seen and approved the dry-run summary.

**Tip:** to *keep* a good auto-capture instead of reverting it, accept it via
`memory_review({ action: "accept", id })` — that promotes it to an `active`
record so a later revert sweep leaves it alone.
