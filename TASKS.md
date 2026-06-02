# TASKS: pi-memory-akg — Phase 3 (DRAFT)

Source: `PRD.md §12` (Phase 3 roadmap) · AKG gap reconciliation: archived (see `docs/akg-gap-inventory.md` in git history through commit `ba7d92b`)
Last updated: 2026-06-02

> **Status of this file.** Phases 0–2 are **complete** (P0-001…P2-015) and validated —
> see `PRD.md §12` and git history through commit `ba7d92b` for the full record (the per-phase
> validation notes once under `docs/` have been archived to git history). Those task entries have
> been rolled off this working doc to keep it focused on active work; recover them from git if needed.
>
> **This is a ROUGH DRAFT.** Phase 3 tasks below (P3-xxx) are a planning batch, not yet
> implementation-ready. Specs are sketches and acceptance criteria are provisional — expect a
> `/plan` pass to tighten interfaces, sizes, and dependencies before any task is picked up.
> Epic 0 and Epic 1 are the most fleshed-out (the immediate next batch); Epics 3–4 are rougher.

---

## Phase 3 — Richer retrieval, long-term maintenance, and cross-file merge

**Goal (from `PRD.md §12`):** memory stays relevant, fast, and maintainable as the graph grows,
and can be combined across files without losing provenance.

**Reconciliation with AKG (the thing that shapes this phase).** Captured in the now-archived gap
inventory (git history through `ba7d92b`) and summarized here: the AKG write-path conformance work
(crash-atomic writes = GAP-1; incremental append-only `commit()` + auto-flush valve = write-side of
GAP-4) shipped in **`akg-ts@0.1.3`, which this project now consumes** — so those durability gains
are live, not pending. Cross-file merge is **spec-unblocked** by AKG `docs/spec/08-merge.md`
(conflict-preservation contract) but **built in neither SDK**, so it's app-level for us — and per
the dogfooding-first decision, deferred until real demand. Read scaling, ranking domains, and
concurrency remain **app-level** concerns.

**Delivery — sequential epics:**

- **Epic 0 — Adopt the landed `akg-ts` write-path** (P3-001…P3-004) — prerequisite, mechanical.
- **Epic 1 — Ranking & richer retrieval** (P3-005…P3-008).
- **Epic 2 — Maintenance & consolidation, single store** (P3-009…P3-011).
- **Epic 3 — Cross-file merge** (P3-012…P3-015) — **deferred, demand-driven** (single-user use never needs it; a committed `.akg` is already shareable).
- **Epic 4 — Named stores/scopes** (P3-016…P3-017) — **deferred, likely a separate Phase 4** (mostly dissolved — see note at the epic).

Epic 0 should land before Epics 1–2 rely on the new SDK behavior. Epic 3 (merge) is independent
of the SDK release and can be designed/prototyped in parallel.

---

## Phase 3 · Epic 0 — Adopt the `akg-ts` write-path

*Consume the crash-safe, incremental-WAL SDK. No new pi-memory capability — this turns the AKG
write-path conformance work into shipped behavior here.*

### P3-001 — Cut the `akg-ts` release and bump the pi-memory dependency — ✅ DONE (2026-06-02)

**Done:** `akg-ts@0.1.3` was published (incremental `commit()`, crash-atomic `writeFileAtomic`,
auto-flush valve, and the new `uncompactedWAL*` accessors) and this repo now pins it.
`npx tsc --noEmit` exits 0 and the full suite (122 tests) passes unchanged against `0.1.3`.

---

### P3-002 — Verify crash-atomicity (GAP-1) with a smoke test

**Depends on:** P3-001

**Output:** A guarded smoke test/script confirming an interrupted commit never yields a torn file.

**Spec (draft):**
- Add `scripts/smoke-crash-atomic.ts` (or a tagged integration test) that: writes and commits a
  store, then simulates an interrupted/overlapping write, and asserts the target file is always
  either the old committed bytes or the new ones — never a truncated hybrid.
- The smoke test is the durable record; if a written note is wanted, keep it brief (e.g. a
  comment in the script or a short `docs/phase3-validation.md` entry) — note the harmless residual
  `.<base>.commit-*` temp file. Don't resurrect a standalone SDK-validation doc.

**Acceptance criteria (draft):**
- The smoke test passes: post-"interruption" the store still `open()`s and decodes without error.
- The SDK version and result are recorded somewhere durable (script comment or `docs/phase3-validation.md`).

---

### P3-003 — Switch the compaction hint to precise WAL accessors + add a compaction cadence

**Depends on:** P3-001

**Output:** `/memory-status` gates its compaction recommendation on `uncompactedWALEntryCount` /
`uncompactedWALByteCount`, and the package can compact on a sensible cadence.

**Spec (draft):**
- In `src/maintenance.ts`: replace the `walGrowthHint` source (currently `nextWALSequence`, the
  EXT-1 fix in commit `ba7d92b`) with `store.uncompactedWALEntryCount` / `uncompactedWALByteCount`,
  with a threshold (draft: hint when entries cross a few thousand or bytes cross a few MB — below
  the SDK's 1,000-entry/10 MB auto-flush so we never collide with it).
- Add an idle/periodic `compact()` trigger (draft: on `session_shutdown` when uncompacted counts
  exceed the threshold, or an explicit maintenance call) — rationale: uncompacted WAL is now
  replayed on every open, so periodic compaction keeps open latency flat.
- Keep the recommendation bounded and non-spammy (the old `hasUncompactedWAL` fired after every
  session's first write — do not regress to that).

**Acceptance criteria (draft):**
- `getMemoryStats` reports `walGrowthHint` derived from `uncompactedWAL*`, not `nextWALSequence`/`hasUncompactedWAL`.
- A unit test (fake store exposing the new accessors) asserts the hint is false below threshold and true above it.
- `/memory-status` shows the "Run maintenance compaction" line only above threshold.

---

### P3-004 — (Optional) App-level advisory lockfile for single-writer (GAP-3)

**Depends on:** P3-001

**Output:** An opt-in advisory lock around `.pi/memory.akg` for multi-process safety.

**Spec (draft):**
- Only if/when multi-process access becomes real. AKG still has no locking and a same-length
  concurrent commit silently loses updates; the SDK's new shorter-WAL guard does not catch it.
- Draft approach: an `O_EXCL` sentinel (`<path>.lock`) or `proper-lockfile` acquired on store open
  for write, released on `close()`; behind a setting (default off — one-store-per-session holds today).

**Acceptance criteria (draft):**
- With the lock enabled, a second writer opening the same file fails fast with a clear message.
- Default-off behavior is unchanged from today.

---

## Phase 3 · Epic 1 — Ranking & richer retrieval

*Make retrieval relevance-aware. All read-side, scan-once-rank-in-memory (AKG reads are O(scan),
no runtime index; `strength`/`confidence` are stored but never validated or used for ranking).*

### P3-005 — Clamp/validate `strength`/`confidence` to `[0,1]` (GAP-5)

**Output:** A small validation helper applied wherever edge `strength`/`confidence` or candidate
`confidence` enters the system, so ranking can trust the domain.

**Spec (draft):**
- Export a `clampUnitInterval(n, fallback)` (or similar) and apply it on write (`memory_link`,
  auto-capture) and on read before ranking. `confidence` may be `null` (preserve null semantics
  per AKG `01-data-model.md`); out-of-range numbers clamp to `[0,1]`.
- Do not reject existing files — clamp on read, validate on write.

**Acceptance criteria (draft):**
- Unit tests: `1.5 → 1`, `-0.2 → 0`, `null → null`, `0.5 → 0.5`.
- A link created with `strength: 2` stores/loads as `1` (or is rejected on write with a clear message — decide in `/plan`).

---

### P3-006 — Implement `src/ranking.ts` (scan-once candidate ranking)

**Depends on:** P3-005, P1-006 (retrieval)

**Output:** `src/ranking.ts` ranks a candidate set against a query using recency, edge
strength/confidence, and tag/type relevance — over a single in-memory scan.

**Spec (draft):**
- Export `rankCandidates(records, opts): RankedRecord[]` with a transparent, documented scoring
  function (draft signals: recency from `last_seen_at`/`updatedAt`, edge `strength`/`confidence`
  for neighborhood relevance, tag/type match weight, `status` penalty for non-active).
- Pure function over an already-fetched array (no per-record store calls — scan once, rank in memory).
- Scoring weights live in one place and are settable, so behavior is tunable without code spread.

**Acceptance criteria (draft):**
- Unit tests assert ordering for constructed inputs (more recent ranks higher; higher-strength
  neighbor ranks higher; inactive penalized).
- No store I/O inside `rankCandidates` (verified by passing a plain array).

---

### P3-007 — Multi-hop / neighborhood retrieval

**Depends on:** P1-006

**Output:** Depth-N neighborhood traversal built on a single adjacency map (not per-hop O(E) scans).

**Spec (draft):**
- Add `fetchNeighborhood(store, rootId, opts: { depth, relations?, limit })` that builds an
  adjacency map once from `listEdges()`/`snapshot()` and BFS-traverses in memory (AKG has only
  single-hop `inbound`/`outboundEdges`, each a full O(E) scan — do not call them per frontier node).
- Extend `RecallFilters.neighborOf` (Phase 1) to accept a `depth`.

**Acceptance criteria (draft):**
- A 3-hop chain A→B→C→D with `depth: 2` from A returns B and C, not D.
- Traversal builds the adjacency map once (verified by a single edge-listing call).

---

### P3-008 — Wire ranking + neighborhood into `memory_recall` / `memory_recent`

**Depends on:** P3-006, P3-007

**Output:** Recall/recent return ranked results and can expand by neighborhood.

**Spec (draft):**
- `memory_recall` applies `rankCandidates` after `fetchCandidates`; add an optional `rank: boolean`
  (default on) and surface depth via `neighborOf`/`depth`.
- Keep the `settings.toolResultBudget` truncation after ranking (rank, then truncate).

**Acceptance criteria (draft):**
- `memory_recall` returns highest-ranked records within budget for a constructed graph.
- Existing Phase 1 recall tests still pass (ranking defaults must not break type/limit/status filters).

---

## Phase 3 · Epic 2 — Maintenance & consolidation (single store)

*Keep a long-lived store compact and curated. Builds on Phase 1 maintenance + forget.*

### P3-009 — Consolidation: detect & merge near-duplicate / superseded records

**Depends on:** P1-007 (maintenance), P1-011 (forget)

**Output:** `src/consolidation.ts` proposes (and, on confirmation, applies) consolidation of
near-duplicate or superseded records within one store.

**Spec (draft):**
- Extend the Phase 1 `findDuplicateCandidates` (exact type+title) toward near-duplicate grouping
  (normalized title, shared tags/type). Propose a canonical record + `supersedes` edges to the rest.
- Apply step reuses Phase 1 forget (supersede mode) + `memory_link` — forward operations only, no
  graph surgery beyond the public tools.
- Dry-run by default; apply only on explicit confirmation (mirror `memory_revert`'s dry-run pattern).

**Acceptance criteria (draft):**
- Given 3 near-duplicate decisions, the proposal nominates 1 canonical and 2 supersedes.
- Apply leaves 1 active + 2 superseded, with `supersedes` edges; dry-run mutates nothing.

---

### P3-010 — Pruning / staleness sweep

**Depends on:** P1-006, P1-011

**Output:** A maintenance helper that surfaces stale/inactive records for pruning.

**Spec (draft):**
- `findStale(store, opts: { olderThanMs?, status? })` → records not seen since a cutoff or already
  inactive/superseded. Pruning reuses forget (deactivate/delete). Dry-run first.
- Decide policy in `/plan`: do we ever hard-delete, or only deactivate + rely on compaction to
  shrink the file? (Leans toward deactivate-by-default given provenance value.)

**Acceptance criteria (draft):**
- `findStale` with a cutoff returns only records older than it.
- Prune dry-run lists candidates without mutating; confirmed prune deactivates them.

---

### P3-011 — Extend status/maintenance for consolidation visibility

**Depends on:** P3-009, P3-010, P1-014

**Output:** `/memory-status` and `getMemoryStats` report consolidation/pruning opportunities.

**Spec (draft):**
- `MemoryStats` gains e.g. `nearDuplicateGroups: number`, `staleCandidates: number`.
- `/memory-status` surfaces a bounded "N consolidation opportunities / M stale records" line and
  points at the relevant tool/command. Still no full-record dumps.

**Acceptance criteria (draft):**
- A unit test asserts the new stat fields against a constructed store.
- `/memory-status` shows the consolidation/stale line when counts > 0.

---

## Phase 3 · Epic 3 — Cross-file merge (GAP-2) — DEFERRED (demand-driven)

> **Deferred.** Single-user local use never invokes merge, and a single `.akg` is directly
> committable to share. Do not start these tasks until a concrete multi-file need appears
> (e.g. reconciling two machines' memory, or resolving a binary git conflict on a shared
> `.pi/memory.akg`). At that point the merge engine below doubles as a git merge driver for
> `.akg`. Kept here as a ready design, not active work.

*App-level, against AKG `docs/spec/08-merge.md`'s conflict-preservation contract — neither SDK
implements merge. Needs no AKG release.*

### P3-012 — Choose & document pi-memory's merge resolution policy

**Output:** A short design note (draft: `docs/merge-policy.md` or a PRD §14 addendum) fixing
pi-memory's resolution policy on top of the `08-merge.md` contract.

**Spec (draft):**
- Restate the contract: identity = `n:{type}:{id}` / `(from,relation,to)`; any differing logical
  field (incl. `version`/timestamps) is a *conflict* an implementer MUST NOT silently discard;
  resolution policy is the SDK/app's choice and must be documented.
- Decide pi-memory's policy: e.g. recency-wins using **source provenance carried in a `meta` key
  we own** (the public API can't carry source `created_at`/`updated_at`/`version`); union tags;
  field-merge `meta`; record both sides' provenance on conflict so nothing is silently lost.
- Decide identity expectations on import (stable caller-chosen IDs required — generated IDs don't
  dedupe; document this for shared/synced stores).

**Acceptance criteria (draft):**
- A written policy doc enumerating: identity, conflict detection, resolution rule, provenance
  preservation mechanism, and the generated-ID caveat.

---

### P3-013 — App-side merge engine

**Depends on:** P3-012, P1-004

**Output:** `src/merge.ts` merges a source store/bytes into the target per the documented policy.

**Spec (draft):**
- `mergeStores(target, source, opts): MergeReport` — snapshot source, import **all nodes before
  any edges** (`putEdge` throws if an endpoint is absent), apply the resolution policy on identity
  collision (union tags, merge meta, carry source provenance into our `meta` key), and stage edges
  by full tuple `(fromType, from, relation, toType, to)`.
- Pure-ish over store accessors so it's testable with the existing fakes/temp stores. Report counts:
  `{ nodesAdded, nodesUpdated, conflicts, edgesAdded }` and a list of conflicts.
- Never lose a side of a conflict silently — record both (per the contract).

**Acceptance criteria (draft):**
- Merging a source with a novel node + a conflicting node yields 1 added, 1 conflict; tags are
  unioned; source provenance is present in the merged record's `meta`.
- Edges whose endpoints were imported land correctly; importing edge-before-node never occurs.
- Re-running the same merge is idempotent (no duplicate nodes for stable IDs).

---

### P3-014 — Expose merge as `memory_merge` tool + `/memory-merge` command

**Depends on:** P3-013

**Output:** `src/tools/merge.ts` exposing import/merge with a dry-run, plus an interactive command.

**Spec (draft):**
- `memory_merge` params: `{ sourcePath; confirm?; mode? }`. No `confirm` → dry-run `MergeReport`
  summary (what would add/update/conflict); `confirm:true` → apply + commit once.
- `/memory-merge` (interactive): show dry-run via `ctx.ui`, confirm, apply. Honor single-writer.

**Acceptance criteria (draft):**
- Dry-run reports counts and mutates nothing; confirmed merge applies and commits once.
- Conflicts are surfaced in the summary, not silently resolved.

---

### P3-015 — Merge tests & validation

**Depends on:** P3-013, P3-014

**Output:** Integration tests + a validation note for the merge path.

**Spec (draft):**
- `test/integration/merge.test.ts`: two real temp stores covering add / update / conflict / edge
  ordering / idempotency / provenance preservation.
- `docs/phase3-validation.md` (new) records a real merge smoke run and the `akg-ts` version.

**Acceptance criteria (draft):**
- `npm run test:integration` passes including the merge suite.
- `docs/phase3-validation.md` exists with the merge run recorded.

---

## Phase 3 · Epic 4 — Named stores / scopes — DEFERRED (likely Phase 4)

> **Mostly dissolved.** "Shared team memory" needs no named store — a single `.akg` is directly
> git-committable, and conflicts between two writers are an Epic-3 merge concern, not a scoping
> one. What genuinely remains is (a) a private/shared *split* within one project (unproven demand)
> and (b) an encrypted *sensitive* store (a standalone security effort that fights the SDK's
> plaintext I/O). Neither justifies a scope-routing system now. Revisit as a separate Phase 4 if
> a real need surfaces.

*Multiple memory files with different sharing/sensitivity policies. Roughest part of the draft.*

### P3-016 — Named store registry & scope routing

**Output:** Support more than one `.pi/memory*.akg` file with a named scope (e.g. `project`,
`shared`, `private`, `sensitive`), routed by setting.

**Spec (draft):**
- A registry mapping scope → file path + policy (shareable, gitignore recommendation, sensitivity).
- Tools gain an optional `scope` param; default scope preserves today's single-file behavior.
- Phase 1 deliberately avoided choices that block this — verify the store lifecycle generalizes to N stores in one process (AKG supports N isolated stores per process safely).

**Acceptance criteria (draft):**
- Two scopes resolve to two distinct files; a write to one does not appear in the other.
- Default behavior (no scope) is byte-for-byte the current single-file behavior.

---

### P3-017 — Sensitive-store handling (app-level encryption)

**Depends on:** P3-016

**Output:** A sensitive scope whose at-rest bytes are encrypted (AKG files are plaintext; at-rest
encryption is an application concern).

**Spec (draft):**
- AKG files are plaintext and the crash-atomic writer leaves a transient plaintext temp file per
  commit — so a strict "never plaintext on disk" posture must bypass the SDK's file I/O entirely
  (encrypt around `Store.fromBytes` / serialized bytes), not rely on `open`/`commit`.
- Decide granularity in `/plan`: whole-file app-layer encryption vs. field-level (encrypt sensitive
  `body`/`meta` values before `putNode`). Start with the simpler whole-file or OS-level option.

**Acceptance criteria (draft):**
- A sensitive-scope file is not readable as plaintext at rest.
- The chosen approach is documented, including the temp-file caveat.

---

## Open Questions (Phase 3)

- **Compaction cadence threshold (P3-003):** exact entry/byte thresholds and trigger point
  (shutdown vs. explicit) — tune against real WAL growth once the release is consumed.
- **Ranking weights (P3-006):** the scoring function is a first guess; needs evaluation against
  real recall sessions.
- **Merge resolution policy (P3-012):** recency-wins vs. richer conflict surfacing; how aggressively
  to auto-resolve vs. defer conflicts to review. This is the key design decision of the phase.
- **Hard-delete vs. deactivate in pruning (P3-010):** policy call given provenance value.
- **Epic 4 scope/timing:** named stores may be large enough to be its own Phase 4; decide after Epics 0–3.

---

## Task Dependency Summary (draft)

```
── Epic 0: Adopt landed akg-ts write-path ──
P3-001 (release + dep bump)
  ├── P3-002 (crash-atomicity smoke)
  ├── P3-003 (precise compaction hint + cadence)
  └── P3-004 (optional lockfile)
── Epic 1: Ranking & retrieval ──   [uses Epic 0's SDK but designable in parallel]
P3-005 (clamp strength/confidence)
P3-006 (ranking) ← P3-005, P1-006
P3-007 (neighborhood) ← P1-006
P3-008 (wire into recall/recent) ← P3-006, P3-007
── Epic 2: Maintenance & consolidation ──
P3-009 (consolidation) ← P1-007, P1-011
P3-010 (pruning) ← P1-006, P1-011
P3-011 (status/maint) ← P3-009, P3-010, P1-014
── Epic 3: Cross-file merge ──   [independent of the SDK release]
P3-012 (resolution policy doc)
P3-013 (merge engine) ← P3-012, P1-004
P3-014 (merge tool + cmd) ← P3-013
P3-015 (merge tests + validation) ← P3-013, P3-014
── Epic 4: Named stores / scopes ──   [rough; may become Phase 4]
P3-016 (store registry + scope routing)
P3-017 (sensitive store encryption) ← P3-016
```
