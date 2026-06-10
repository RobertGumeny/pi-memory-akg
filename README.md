# pi-memory-akg

AKG-backed durable project memory for [Pi](https://github.com/earendil-works/pi). Stores decisions, constraints, preferences, tasks, and artifacts across sessions — without replacing Pi's JSONL session history.

> **Status: pre-alpha (`v0.1.0-alpha.1`).** Early, but the explicit memory loop is
> dogfood-validated. Automatic capture is experimental and **off by default** — the
> alpha is about explicit, durable, inspectable project memory.

## Install

```bash
pi install git:github.com/RobertGumeny/pi-memory-akg@v0.1.0-alpha.1
```

Pinned to a git tag for the pre-alpha. During development, load directly from a clone. Install dependencies once (pulls the `akg-ts` runtime dep and the dev toolchain), then load from the repo root:

```bash
npm install
pi -e ./
```

## Requirements

- **Pi 0.78.0+** (validated against 0.78.0).
- **`akg-ts@0.1.3`** — installed automatically as a dependency. No separate build step; Pi loads the TypeScript directly.
- **No model or API key required** for the explicit memory tools. (The experimental auto-capture feature, when enabled, rides on the session's active model — see [Automatic capture](#automatic-capture-experimental--off-by-default) below.)

## Quick start

Once the package is loaded, verify it's live and store your first memory:

```text
/memory-status        # prints the memory file path, counts, and suggested next actions
```

`/memory-status` is the fastest "is it working?" check. From there, just work normally — the agent stores and recalls durable facts through the `memory_*` tools below (or ask it directly, e.g. "remember that we decided to use AKG for durable memory"). Memory persists across sessions in `.pi/memory.akg`.

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

> `memory_review` and `memory_revert` exist too, but only register when the
> experimental auto-capture feature is enabled. See [Automatic capture](#automatic-capture-experimental--off-by-default).

## Commands & slash prompts

| Command / prompt | Purpose |
|--------|---------|
| `/memory-status` | Deterministic command: file path, counts, recent refs, next actions |
| `/memory-cleanup` | Prompt template: curation pass for duplicates, stale tasks, superseded records |

`/memory-review` and `/memory-revert` are registered only when auto-capture is enabled (experimental).

## Automatic capture (experimental — off by default)

> **Disabled by default in this alpha.** Set `autoCaptureEnabled: true` to opt in.
> While off, the auto-capture tools (`memory_review`, `memory_revert`), commands
> (`/memory-review`, `/memory-revert`), and the compaction/branch ingestion hooks
> are not registered at all. This behavior is not yet dogfooded through real Pi
> lifecycle hooks — treat it as a preview.

The package can capture durable memories automatically — but only from Pi's
already-distilled **compaction and branch summaries**, never from raw turns. A
bounded LLM pass extracts candidate facts; deterministic plumbing (dedup,
provenance, the queue, revert) keeps it transparent and reversible.

> **Uses the session's active model.** The extraction pass makes a separate, bounded
> call (one-shot, low token cap, temperature 0) to whatever model your session already
> uses — no separate model or key to set up, but it does spend extra tokens on
> compaction/branch events. In a session with no usable model (e.g. offline mode) it
> no-ops safely — the explicit tools still work; the review queue just stays empty.

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
| `autoCaptureEnabled` | `false` | Master switch for auto-capture (experimental; opt-in) |
| `autoCaptureSources` | `["compaction", "branch"]` | Which summaries to extract from |
| `headlessPolicy` | `"auto-commit"` | Headless behavior: `auto-commit` \| `defer` \| `off` |
| `candidateQueuePath` | `.pi/memory-candidates.jsonl` | Sidecar pending-queue path |
| `autoCommitMinConfidence` | `0.7` | Min confidence to auto-commit (headless) |
| `dropBelowConfidence` | `0.3` | Candidates below this are discarded, not queued |
| `maxCandidatesPerExtraction` | `10` | Cap per summary |
| `liveTurnNudge` | `false` | Opt-in `/memory-review` nudge after a turn (no LLM pass) |

Core settings (`hintEnabled`, `hintBudget`, `toolResultBudget`,
`requireConfirmationForAll`, `memoryFilePath`, and `debug` — opt-in stderr
diagnostics, default `false`) are independent of auto-capture.

## Roadmap

- **Phase 0** (complete) — SDK and Pi package baseline validation
- **Phase 1** (complete) — Explicit memory tools and agent-directed retrieval
- **Phase 2** (complete) — Selective automatic extraction from compaction/branch summaries, with a review queue and bulk revert
- **Phase 3** (drafted) — Richer retrieval and long-term maintenance, built on `akg-ts@0.1.3` (crash-atomic writes now adopted)

**Immediate next step: single-user dogfooding** on a real project. The crash-safe SDK is in place and the core loop is built — actual use is what should drive the rest, so Phase 3 is intentionally a *draft* gated on that signal:

- **Near-term** — finish write-path adoption (crash-atomicity smoke test, precise WAL-based compaction hint) and add recall **ranking** (recency / edge strength / relevance) plus multi-hop retrieval.
- **As real use justifies it** — consolidation and pruning of stale or duplicate memories.
- **Deferred until there's demand** — cross-file **merge** and **named/shared stores**. Not needed for single-user local use; parked on purpose rather than built speculatively.

See [CHANGELOG.md](CHANGELOG.md) for release notes and known limitations.
