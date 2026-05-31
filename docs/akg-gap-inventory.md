# AKG Gap Inventory

**What this is:** `pi-memory-akg` is the first real-world workload driving AKG. Using it for real surfaces places where the **AKG spec is silent**, the **SDK under-delivers**, or the **extension has to invent a workaround**. This doc is the running list of those gaps — the input to AKG-side planning, not a request to an outside team.

**How to read each entry:** the consumer scenario that exposed it → what AKG does today → the *altitude* (does the **spec** need a decision, the **SDK** an implementation, or is it an **extension** workaround) → the open design question AKG must answer → our interim workaround.

**The loop:** probe finds a gap → AKG decides what it promises → SDK implements → extension adopts → adoption surfaces the next gap.

Analyzed against `akg-ts@0.1.2` (2026-05-30). Most findings apply to the spec, independent of SDK version.

---

## GAP-1 — Durability: the file can be shredded by a crash mid-write

- **Scenario:** A Pi session commits memory; the process is killed (or the box loses power) during the write.
- **Today:** `commit()`/`compact()` rewrite the whole file by truncating it in place and writing fresh bytes — not temp-file-then-rename. A crash in that window can leave a truncated/partial file. The function is *named* `writeFileAtomic` but is not crash-atomic.
- **Altitude:** **Spec** (should a conformant AKG store guarantee "no partial file on crash"?) → then **SDK** (implement it).
- **Decision AKG must make:** Is crash-atomic write a **conformance requirement** AKG promises, or explicitly out of scope? Right now it's an unwritten promise the SDK silently breaks.
- **Interim workaround:** None in place. Could add a backup-before-compact copy app-side. Real fix belongs in the SDK.
- **Size/risk:** SDK fix is small and **byte-identical output** (no format change). Highest value, lowest blast radius.

## GAP-2 — Merge: AKG has no notion of combining two memory files, and loses provenance if you try

- **Scenario:** Merge or sync memory from two `.akg` files (named stores, shared team memory, imported memory).
- **Today:** No merge API. The only path is snapshot → re-`put` every node/edge, which (a) requires importing nodes before edges, (b) replaces records whole (no tag/field union), and (c) **cannot preserve the source's original `created_at`/`updated_at`/`version`** — imported facts get stamped with import time. The fields already exist in the format and the internal code path honors them; the *public API just won't let you set them.*
- **Altitude:** **Spec** (what does "merge" mean in AKG at all?) → **SDK** (expose the capability).
- **Decision AKG must make:** Is merge an AKG concept or strictly app-level? What is record identity across files, what is the conflict policy, and does merge preserve provenance/recency? For a memory product whose whole point is "remember *when/why* we learned this," provenance-preserving merge is close to required.
- **Interim workaround:** Stash origin timestamps in a `meta` key we own and rank recency on that instead of `updatedAt`. Works, but every consumer re-inventing it is the signal that this belongs in the data model.
- **Size/risk:** Exposing `putNodeRaw`/`merge(..., { preserveTimestamps })` needs **no new format fields** (they already exist). One thing to verify: whether the WAL record carries timestamps or re-derives them on replay (if the latter, a small WAL-record extension).

## GAP-3 — Concurrency: no traffic cop for two writers, and the rule was never written down

- **Scenario:** Two Pi sessions (or any two writers) open the same `.akg` file.
- **Today:** No lock of any kind. Each writer holds the whole graph in memory and rewrites the file from *its* view on commit, so the second to commit silently stomps the first (lost update). The "single-writer" expectation is real but exists only as SDK behavior, never as a stated contract.
- **Altitude:** **Spec** (state the concurrency/consistency model explicitly) → **SDK** (optional advisory lock).
- **Decision AKG must make:** Declare the model — "single-writer per file, last-writer-wins, no MVCC" — so locking becomes an impl detail under a written rule. Should the SDK offer an opt-in lock?
- **Interim workaround:** We enforce one store instance per session by convention; could add an app-level lockfile.
- **Size/risk:** A lockfile is a sidecar file — **no `.akg` format change.**

## GAP-4 — Scale: every read scans the whole graph; no index, no format-evolution policy

- **Scenario:** Memory grows to tens or hundreds of thousands of records; we want ranking and multi-hop retrieval.
- **Today:** Everything is an in-memory linear scan (no runtime indexes; the on-disk derived keys aren't used as query indexes). Fine ≤10k, gets heavy at 100k. Adding a persisted index later would be a new format section — and there's **no documented policy for how the format evolves** (version markers, reader behavior on unknown sections).
- **Altitude:** **Spec** (is O(scan) the contract? define a format-evolution/versioning policy) → **SDK** (optional index) → **Extension** (cache/scan-once for now).
- **Decision AKG must make:** Is read-scaling AKG's job (indexes in the format) or the consumer's (cache and scan once)? And independently: write the format-versioning policy *before* the first optional section is ever added.
- **Interim workaround:** "Scan once, rank in memory" — build one snapshot/adjacency map per query instead of many helper calls. Sufficient for our foreseeable sizes.
- **Size/risk:** In-memory index = no format change. Persisted index = format change, needs the evolution policy first. Easy to defer.

## GAP-5 — Value domains: `strength`/`confidence` aren't range-checked because the spec never said the range

- **Scenario:** We store and (in Phase 3) rank on edge `strength`/`confidence`.
- **Today:** Both accept any number; nothing enforces `[0,1]`; `confidence` may be `null`. The SDK "happens not to validate" because the spec is silent on the domain.
- **Altitude:** **Spec** (define the value domains + `null` semantics) → **SDK** (enforce on decode).
- **Decision AKG must make:** What are the legal ranges, and is enforcing them a tightening that could reject currently-decodable files? (Conformance-rule change, **no byte-layout change.**)
- **Interim workaround:** Validate/clamp in our code if we rely on these for ranking.
- **Size/risk:** Tiny — but verify against the v1 spec to know if it's "enforce existing rule" vs "new (possibly breaking) rule."

## GAP-6 — Data model: what do timestamps/`version` mean across writes and merges?

- **Scenario:** Underpins GAP-2; also affects recency ranking generally.
- **Today:** `version` is a plain per-store write-counter (not causality/vector clock); `created_at` is preserved on update, `updated_at` is always "now." Across a merge/import, none of the source's values survive the public API.
- **Altitude:** **Spec** (data-model semantics) — the merge decision (GAP-2) depends on this.
- **Decision AKG must make:** Is `version` just a write count, or should it carry meaning for merge/causality? What do the timestamps promise across stores?
- **Interim workaround:** Treat `version` as opaque; carry our own provenance timestamps in `meta` (see GAP-2).

---

## Extension-level fix to make now (ours, not AKG's)

- **EXT-1 — `walGrowthHint` is wired to the wrong signal.** Our Phase 2 `/memory-status` "consider compaction" hint reads `hasUncompactedWAL`, which flips true after the *first* write of every session and stays true — so the hint is permanent noise. Fix: gate on `nextWALSequence` crossing a threshold (the real WAL-bloat proxy). Small, self-contained, testable.

---

## The shortlist of decisions

| Gap | Decision | Recommended call |
|-----|----------|------------------|
| GAP-1 Durability | Promise crash-atomicity? | **Yes — do it.** Foundational, cheap, no format change. |
| GAP-3 Concurrency | Write down single-writer + add a lock? | **Yes — lower urgency.** No format change. |
| EXT-1 status bug | Fix our hint | **Yes — do now.** |
| GAP-5 Value domains | Define + enforce ranges | **Yes, after a quick v1-spec check.** |
| GAP-2 / GAP-6 Merge + timestamps | What does merge mean in AKG? | **Deliberate design call** — the big one; needs a planning session. |
| GAP-4 Scale/index | Indexes in AKG, or consumer caches? | **Defer.** Work around it; revisit when size forces it. |

**Out of scope for AKG (a decision in itself):** at-rest encryption for a "sensitive" store stays an application concern; AKG should just say so explicitly.
