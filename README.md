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

Phase 2 auto-capture also keeps a sidecar review queue (pending candidates, not yet in the graph) at:

```
.pi/memory-candidates.jsonl
```

These files are project-local and portable. For private/local memory, add both to `.gitignore`:

```
printf '%s\n' '.pi/memory.akg' '.pi/memory-candidates.jsonl' >> .gitignore
```

For shared team memory, intentionally omit `.pi/memory.akg` from `.gitignore` and commit it. The package never modifies `.gitignore` automatically.

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
| `memory_review` | List/accept/reject pending auto-captured candidates from the review queue |
| `memory_revert` | Dry-run then deactivate/delete auto-captured `unreviewed` memories |

## Commands & slash prompts

| Command / prompt | Purpose |
|--------|---------|
| `/memory-status` | Deterministic memory status — file path, counts, queue depth, unreviewed count, next actions |
| `/memory-review` | Walk the pending auto-capture queue and accept/reject each candidate |
| `/memory-revert` | Dry-run then revert auto-captured `unreviewed` memories |
| `/memory-cleanup` | Curation pass: duplicates, stale tasks, superseded records, unreviewed sweeps |

## Automatic capture (Phase 2)

The package can capture durable memories automatically — but only from Pi's
already-distilled **compaction and branch summaries**, never from raw turns. A
bounded LLM pass extracts candidate facts; deterministic plumbing (dedup,
provenance, the queue, revert) keeps it transparent and reversible.

Lifecycle: a captured memory is `unreviewed` → you **review** it (accept → it
becomes `active`, or reject) → or you **revert** it (a forward forget, not a
rollback).

- **Interactive sessions defer everything** for human review — nothing
  auto-commits. Confident candidates wait in `.pi/memory-candidates.jsonl`.
- **Headless / RPC sessions default to `auto-commit`**: confident *and* safe
  candidates write straight to the graph as `status: "unreviewed"`,
  `source: "auto"`, with full provenance; sensitive or low-confidence ones defer
  to the queue. An orchestrator can audit via the RPC stream and bulk-revert.

### Settings (defaults)

| Setting | Default | Meaning |
|---------|---------|---------|
| `autoCaptureEnabled` | `true` | Master switch for auto-capture |
| `autoCaptureSources` | `["compaction", "branch"]` | Which summaries to extract from |
| `headlessPolicy` | `"auto-commit"` | Headless behavior: `auto-commit` \| `defer` \| `off` |
| `candidateQueuePath` | `.pi/memory-candidates.jsonl` | Sidecar pending-queue path |
| `autoCommitMinConfidence` | `0.7` | Min confidence to auto-commit (headless) |
| `dropBelowConfidence` | `0.3` | Candidates below this are discarded, not queued |
| `maxCandidatesPerExtraction` | `10` | Cap per summary |
| `liveTurnNudge` | `false` | Opt-in `/memory-review` nudge after a turn (no LLM pass) |

Phase 1 settings (`hintEnabled`, `hintBudget`, `toolResultBudget`,
`requireConfirmationForAll`, `memoryFilePath`) are unchanged.

## Roadmap

- **Phase 0** (complete) — SDK and Pi package baseline validation
- **Phase 1** (complete) — Explicit memory tools and agent-directed retrieval
- **Phase 2** (complete) — Selective automatic extraction from compaction/branch summaries, with a review queue and bulk revert
- **Phase 3** — Richer retrieval, long-term maintenance, and pruning workflows

See [PRD.md](PRD.md) for full product requirements and phase detail.
