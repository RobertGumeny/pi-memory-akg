---
name: akg-memory
description: Selective durable memory policy for the pi-memory-akg package. Teaches when and how to store, recall, link, forget, and maintain project memory across Pi sessions.
---

# AKG Durable Memory — Skill

This skill governs how to use AKG project memory selectively and deliberately. Pi session JSONL files remain the source of truth for exact conversation history. AKG stores reusable knowledge — facts worth having again next session without re-reading transcripts.

---

## What qualifies as durable memory

Store facts that are:

- **Decisions**: architectural choices, technology selections, tradeoffs accepted (e.g. "We use AKG over a vector DB because the graph model fits the relationship-heavy data").
- **Constraints**: hard limits, compliance rules, non-negotiables (e.g. "No external API calls from the worker thread").
- **Preferences**: user-stated working style preferences (e.g. "Prefer project-local npm installs over global").
- **Tasks**: active or planned work items that need to survive session boundaries.
- **Artifacts**: important files, scripts, configs, or outputs created during the project.
- **Repo facts**: stable truths about the codebase (e.g. "Entry point is src/index.ts; no barrel files").
- **Relationships between records**: use `memory_link` to express how decisions affect constraints, how tasks depend on each other, etc.

---

## What must NOT be stored

- **Every message or turn** — do not mirror Pi session JSONL into AKG. Sessions already preserve exact history.
- **Raw tool output** — do not store the full output of bash commands, file reads, or search results as memory records.
- **Full transcripts or conversation summaries** — AKG is not a transcript archive.
- **Low-confidence or inferred facts without confidence metadata** — if you are not certain, set `confidence_reason` in the record or avoid storing it.
- **Secrets, API keys, tokens, or passwords** — AKG memory is not a secret vault. Store references or handling instructions, not raw values. The tool will ask for confirmation if it detects secret-like content.
- **Transient state** — do not store facts that change every session (current file contents, current test results, volatile environment values).
- **Duplicate records** — always check if a record with the same type and title already exists before calling `memory_remember`. If it does, update it rather than creating a second copy.

---

## When to update, supersede, link, or forget

**Update** (call `memory_remember` with the same type and title): when a fact evolves but the old version is no longer useful. The stable slug means calling with the same type+title overwrites in place.

**Supersede** (call `memory_forget` with `mode: "supersede"` then `memory_remember` for the replacement): when a new decision replaces an old one and you want to preserve the lineage. Use `memory_link` with `relation: "supersedes"` to connect them.

**Link** (call `memory_link`): when two records have a meaningful relationship — a decision that affects a constraint, a task that depends on another, an artifact that implements a decision.

**Forget / deactivate** (call `memory_forget` with default mode): when a task is done, a constraint no longer applies, or a preference has been revoked. Deactivating preserves history without cluttering recall results.

**Delete** (call `memory_forget` with `mode: "delete"`): only when a record was created by mistake and has no useful historical value. Hard deletion requires `cascade: true` if the record has live edges.

---

## Provenance and uncertainty

Always set provenance when storing a record:

- `source`: use `"manual"` when you are explicitly told to remember something, `"inferred"` when you are inferring from context.
- `confidence_reason`: required for inferred facts. Example: `"inferred from repeated user corrections"`.
- `session_id` and `entry_ids`: pass from Pi session context when available for traceability.
- `cwd`: always include the project directory so records are traceable to a repo.

Do not store an inferred fact with the same confidence as an explicit user statement. If you are uncertain, either ask the user to confirm or include `confidence_reason` and tag with `confidence:low`.

---

## How to use each tool safely

### memory_remember
Call when a durable fact has been established. Provide a clear `type`, a concise `title` (used as the stable identity key), and a complete `body`. Include relevant `tags`. If the body might contain sensitive data, include `confirm: true` only after the user has explicitly asked to store it. Do not call in a loop to mirror every message.

### memory_recall
Call at the start of a task to check for relevant context. Filter by `types` and `tags` to keep results focused. Default limit is 10 — do not retrieve more than needed. Results are compact summaries; use `memory_inspect` to drill into a specific record. Does not support full-text search — use type and tag filters.

### memory_link
Call after creating related records to express the relationship. Always verify both records exist before calling. Use the most specific applicable relation type from: `affects`, `depends_on`, `blocks`, `implements`, `documents`, `derived_from`, `supersedes`, `relevant_to`.

### memory_forget
Default to `mode: "deactivate"` rather than `"delete"`. Deactivated records are excluded from recall but remain inspectable. Use `"supersede"` when a new record replaces the old one. Use `"delete"` with `cascade: true` only for records created by mistake.

### memory_recent
Call when you want to see what was last worked on — useful at the start of a session to re-orient. Combine with `types` filter to narrow to relevant categories.

### memory_inspect
Call when `memory_recall` returns a record that looks relevant and you need its full body, metadata, and edges. Do not inspect records speculatively — check the recall summary first.

### memory_review
Call to triage the pending auto-capture queue. `action: "list"` shows pending candidates; `action: "accept"` (with an `id`, and optional `edits` to fix the title/body/type/tags) promotes a candidate to an `active` memory record; `action: "reject"` discards it. Prefer editing a slightly-wrong candidate over rejecting and re-authoring it. The `/memory-review` command walks the queue interactively.

### memory_revert
Call to undo auto-captured memories that should not have been written. Always run it as a **dry run first** (no `confirm`) to see exactly what would be affected, then re-run with `confirm: true`. Default mode `deactivate` keeps the records inspectable; `delete` removes them. Narrow the sweep with `origin` (`compaction`/`branch`) or `sinceMs`. This is a forward forget, not a rollback.

---

## Automatic capture (Phase 2)

The package can capture durable memories **automatically**, but only from Pi's
already-distilled summaries — never from raw turns:

- **Sources are summaries only.** A bounded LLM extraction pass runs on Pi
  compaction summaries (`session_compact`) and branch summaries (`session_tree`).
  Raw completed turns are *not* auto-extracted; at most they trigger an opt-in,
  deterministic `/memory-review` nudge. This keeps auto-capture low-noise.
- **`status: "unreviewed"` + `source: "auto"`** mark every auto-captured node.
  They are visible to recall but flagged as not-yet-human-reviewed. Promote them
  to `active` via `memory_review` (accept), or sweep them with `memory_revert`.
- **Interactive sessions defer everything.** When a human is present
  (`hasUI`), nothing auto-commits — confident candidates wait in the pending
  queue for review. **Headless sessions** (orchestrator/RPC) may auto-commit
  *confident and safe* candidates as `unreviewed`; sensitive, secret-like, or
  low-confidence ones always defer to the queue.
- **The queue lives outside the graph**, in `.pi/memory-candidates.jsonl`.
  Deferred candidates are *not* in the `.akg` file until accepted.

When you see `unreviewed`/`source: auto` records, treat them as suggestions:
inspect, then accept (with edits if needed) or revert. Apply the same
selective-memory and anti-noise rules above — auto-capture does not lower the bar
for what deserves to be remembered.

---

## Keeping memory compact

- Prefer superseding over accumulating stale records.
- When a constraint is lifted or a preference changes, deactivate the old record and store the new one.
- Run `/memory-cleanup` periodically to identify duplicate candidates and superseded records that could be merged.
- The goal is a small, high-signal graph — not a complete history.

---

## Positive examples (should store)

1. **Decision**: "We selected TypeScript strict mode for this project to catch type errors early, accepted the verbosity tradeoff." → `type: decision, title: Use TypeScript strict mode, tags: [design, durable]`

2. **Constraint**: "The CI pipeline does not have network access — all npm installs must use the offline cache." → `type: constraint, title: CI has no network access, tags: [repo_fact, workflow]`

3. **Preference**: "User prefers project-local package installs over global installations." → `type: preference, title: Prefer project-local npm installs, tags: [user_pref, durable]`

---

## Negative examples (must not store)

1. **Raw tool output**: The full stdout of `git log --oneline -20`. This is transient, large, and already recoverable by re-running the command.

2. **Every assistant message**: A summary of what the assistant just explained. Pi sessions already store the exact exchange; duplicating it in AKG creates noise and inflates recall results.

3. **Low-confidence inferred fact without metadata**: "The user probably prefers tabs over spaces" inferred from one file. Do not store without `confidence_reason` and `confidence:low` tag, and preferably confirm with the user first.
