# pi-memory-akg

AKG-backed durable project memory for [Pi](https://github.com/earendil-works/pi). Stores decisions, constraints, preferences, tasks, and artifacts across sessions — without replacing Pi's JSONL session history.

## Install

```bash
pi install git:github.com/rgumeny/pi-memory-akg
```

During development, load directly from the repo root:

```bash
pi -e ./
```

## Memory file

The package creates a per-project memory file at:

```
.pi/memory.akg
```

This file is project-local and portable. For private/local memory, add it to `.gitignore`:

```
echo ".pi/memory.akg" >> .gitignore
```

For shared team memory, intentionally omit it from `.gitignore` and commit it. The package never modifies `.gitignore` automatically.

## What gets stored

AKG stores reusable knowledge — not transcripts. Good candidates: architectural decisions, hard constraints, user preferences, active tasks, important files, and relationships between these facts.

Pi JSONL session files remain the source of truth for exact conversation history. See [skills/akg-memory/SKILL.md](skills/akg-memory/SKILL.md) for the full storage policy.

## Tools

| Tool | Purpose |
|------|---------|
| `memory_remember` | Create or update a durable typed memory record |
| `memory_recall` | Retrieve compact candidate records with type/tag/status filters |
| `memory_link` | Add a typed relationship edge between two records |
| `memory_forget` | Deactivate, supersede, or delete a memory record |
| `memory_recent` | List recently updated records ordered by update time |
| `memory_inspect` | Inspect full details and edges for a specific record by ID |

## Slash prompts

| Prompt | Purpose |
|--------|---------|
| `/memory-status` | Interpret current memory state — counts, recent titles, next actions |
| `/memory-review` | End-of-session review: identify and propose new durable facts to store |
| `/memory-cleanup` | Curation pass: identify duplicates, stale tasks, and superseded records |

## Roadmap

- **Phase 0** (complete) — SDK and Pi package baseline validation
- **Phase 1** (complete) — Explicit memory tools and agent-directed retrieval
- **Phase 2** — Selective automatic extraction from completed turns and compaction summaries
- **Phase 3** — Richer retrieval, long-term maintenance, and pruning workflows

See [PRD.md](PRD.md) for full product requirements and phase detail.
