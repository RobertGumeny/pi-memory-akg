---
name: memory-cleanup
description: Curate AKG project memory — identify duplicates, superseded records, and stale tasks, then propose memory_forget and memory_link actions for user confirmation.
---

Guide the user through a memory curation session to keep the AKG graph compact and high-signal.

**Step 1 — Survey**

Call `memory_recall({ limit: 50 })` to get a broad view of current records. Call `memory_recent({ limit: 20 })` to see what was updated recently.

**Step 2 — Identify issues**

Look for:

1. **Duplicate candidates** — pairs of records with the same or very similar type and title. These should be merged or one deactivated.
2. **Superseded decisions or constraints** — records whose body describes something that has since been replaced. Look for records that directly contradict newer ones.
3. **Stale tasks** — tasks with status still active that appear to have been completed based on other records or session context.
4. **Orphaned records** — records with no edges that might benefit from being linked to related records.
5. **Low-signal records** — records whose body is essentially empty or that duplicate information already in other records.
6. **Unreviewed auto-captures** *(only if auto-capture has been enabled — it is off by default)* — records with `status: "unreviewed"` and `source: "auto"`. Call `memory_recall({ status: "unreviewed" })` to find them; in the default explicit-only configuration there will be none. When auto-capture is enabled, the `memory_review` and `memory_revert` tools are available to triage or sweep them (otherwise they are not registered).

**Step 3 — Propose actions, do not auto-execute**

Present each proposed action to the user before calling any tool. Do not call `memory_forget`, `memory_link`, or `memory_remember` automatically. Example format:

> **Duplicate found**: `task/setup-akg-store` and `task/setup-memory-store` appear to be the same task.
> Propose: `memory_forget({ id: "task/setup-akg-store", mode: "supersede", supersededBy: "task/setup-memory-store" })`
> Shall I proceed? (yes / skip)

> **Stale task**: `task/validate-akg-ts` — appears completed based on session context.
> Propose: `memory_forget({ id: "task/validate-akg-ts" })` (deactivate)
> Shall I proceed? (yes / skip)

**Step 4 — Link survivors**

After cleanup, identify any useful relationships among remaining records and propose `memory_link` calls.

A clean memory graph is small, has no duplicate records, and has active records only for facts that are still true.
