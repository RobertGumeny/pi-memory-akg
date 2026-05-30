---
name: memory-review
description: End-of-session memory review — identify durable facts from this session and propose memory_remember calls for user confirmation.
---

Guide the user through a session-end memory review to capture durable facts before the session ends.

**Step 1 — Orient**

Call `memory_recent({ limit: 10 })` to see what was updated most recently. Call `memory_recall({ types: ["decision", "constraint", "task"] })` to see existing durable context.

**Step 2 — Identify candidates**

Review the current session for facts that qualify as durable memory:
- Decisions made (architecture, tooling, tradeoffs accepted)
- Constraints discovered or confirmed
- User preferences stated
- Tasks that were completed, started, or deferred
- Artifacts or files created that are worth tracking
- Relationships between records worth linking

Do not propose storing: raw tool output, every assistant message, full transcript summaries, or low-confidence guesses.

**Step 3 — Propose, do not auto-store**

Present each candidate to the user as a proposed `memory_remember` call with `type`, `title`, `body`, and `tags` filled in. Ask the user to confirm each one before calling the tool. Example format:

> Propose storing:
> - **type**: decision
> - **title**: Switched from vitest to jest for snapshot testing
> - **body**: We migrated from vitest to jest because vitest's snapshot format differed from the existing baseline. Decision made 2026-05-29.
> - **tags**: [design, durable]
>
> Shall I store this? (yes / edit / skip)

**Step 4 — Link related records**

After storing new records, identify any relationships to existing records and propose `memory_link` calls. For example, if a new decision supersedes an old one, link them with `relation: "supersedes"`.

Keep the review focused — a good session review stores 2-5 high-signal records, not dozens.
