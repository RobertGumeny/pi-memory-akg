# akg-ts SDK Validation

Validated against `akg-ts@0.1.1` on 2026-05-28.

## API Coverage

All required public APIs are available and tested via `scripts/validate-akg-ts.ts` (27/27 pass).

| API | Status |
|-----|--------|
| `Store.open(path)` | ✓ Available |
| `putNode(type, id, fields, tags)` | ✓ Available — creates or updates in place |
| `getNode(type, id)` | ✓ Available |
| `deleteNode(type, id)` | ✓ Available — throws on live edges |
| `deleteNodeCascade(type, id)` | ✓ Available — removes node + all edges |
| `compact()` | ✓ Available |
| `recentNodes(filter?)` | ✓ Available |
| `recentEdges(filter?)` | ✓ Available |
| `listNodesFiltered(filter)` | ✓ Available |
| `getNodes(refs[])` | ✓ Available |
| `listEdges(filter?)` | ✓ Available |
| `snapshot()` | ✓ Available — returns `{ nodes, edges }` |
| `outboundEdges(ref, relation?)` | ✓ Available |
| `inboundEdges(ref, relation?)` | ✓ Available |
| `putEdge(from, relation, to, fields)` | ✓ Available |
| `commit()` | ✓ Available |
| `close()` | ✓ Available |

## Edge Strength Default

When `putEdge` is called without a `strength` field in `EdgeFields`, the created edge has `strength === 0.5`. Confirmed by test:

```
store.putEdge(fromRef, "relevant_to", taskRef, {});
outboundEdges(fromRef, "relevant_to")[0].strength === 0.5  // true
```

This matches the AKG v1 spec value documented in the PRD (§9).

## Delete Behavior

- `deleteNode(type, id)`: throws an error when the node has live inbound or outbound edges. The error must be caught by callers.
- `deleteNodeCascade(type, id)`: removes the node and all of its inbound/outbound edges atomically. Returns `{ deletedNode, deletedInboundEdges, deletedOutboundEdges }`.

Phase 1 `memory_forget` with `mode: "delete"` should use `deleteNode` by default and `deleteNodeCascade` when `cascade: true` is passed.

## Single-Writer Semantics

The SDK does **not** throw when a second `Store.open()` call is made on the same file path within the same process. Two store instances can be opened simultaneously without a runtime error.

This means the SDK has **no built-in lock-file or advisory locking**. If two store instances write to the same file concurrently, the last commit wins and intermediate writes may be lost.

**Consequence for Phase 1:** The extension must enforce single-writer semantics at the application level. All mutations to `.pi/memory.akg` within one Pi session must go through a single `MemoryStore` instance, opened once in `session_start` and closed in `session_shutdown`. See `docs/phase0-validation.md §Write-Serialization Decision`.

## Limitations

- **Full-text/lexical search over node title/body is not available in the SDK.** There is no search API on the `Store` class. Phase 1 retrieval must rely on type, tag, metadata, recency, and graph-neighborhood filters only. Any title/body text matching would require a full in-memory scan, which is acceptable only for small graphs and should be implemented as an explicitly bounded extension-level feature if needed.
- **No built-in cross-process locking.** Each Pi session must open its own store instance and must not share `.pi/memory.akg` with another running Pi session simultaneously.
- **No merge helper.** Merging multiple `.akg` files is out of scope for Phase 1.
- **`listNodes(typeName?)` vs `listNodesFiltered(filter)`**: `listNodes` accepts an optional type string; `listNodesFiltered` accepts a richer filter object with `type`, `tag`, and `meta` fields. Use `listNodesFiltered` for multi-field filtering.

---

## Addendum — 0.1.2 capability deep-dive (2026-05-30)

A read-only source analysis of `akg-ts@0.1.2` (against `sdk/akg-ts/src/`) for Phase 3
planning corrected and expanded several facts above. The design implications and the
open questions for AKG itself are tracked in [`akg-gap-inventory.md`](akg-gap-inventory.md);
this section records only the **SDK behavioral facts**.

**Version delta:** 0.1.2 over 0.1.1 adds only a docs CLI (`akg-ts-docs`). **No `Store`
API changed.** Every fact below applies to both 0.1.1 and 0.1.2.

- **Writes are NOT crash-atomic.** `commit()`/`compact()` rewrite the whole file by
  truncating in place (open `'w'` → write → `fsync` → close), not temp-file + rename.
  A crash mid-write can leave a truncated/partial file. (Gap inventory GAP-1.) This
  refines the PRD §11 reliability assumption.
- **Every commit rewrites the entire file** (full data section + the entire accumulated
  WAL); there is no incremental/append write path. The data section is always current,
  so the WAL is pure redundant history that grows until `compact()` resets it.
- **WAL/compaction signals.** `hasUncompactedWAL` ⟺ "≥1 commit since open/compact" — it
  flips true after the first write and stays true, so it is **not** a size/threshold
  signal. `nextWALSequence - 1` ≈ total WAL records since the last compaction and is the
  real bloat proxy. Our `walGrowthHint` now gates on `nextWALSequence` (see
  `src/maintenance.ts`).
- **All reads are O(scan).** Nodes/edges live in in-memory maps; the on-disk derived
  keys (`t:`/`ts:`/`ei:`) are format/conformance only, never used as runtime query
  indexes. `inbound/outboundEdges` scan all edges per call. Comfortable ≤10k, heavy at
  100k → scan-once-rank-in-memory at scale. (GAP-4.)
- **No merge; provenance not preservable on import.** No merge API. The composable path
  is `snapshot()` → re-`put` (import **nodes before edges** — `putEdge` throws
  `NotFoundError` on a missing endpoint). `putNode` is whole-record last-writer-wins (no
  tag/meta/field union), and the public API **cannot set** `created_at`/`updated_at`/
  `version` — imported records get import-time stamps. The fields exist in the
  format/codec; only the public API withholds them. (GAP-2 / GAP-6.)
- **Concurrency.** N *different* files in one process are fully isolated and safe. Two
  writers on the *same* file → silent lost-update (second commit overwrites the file
  from its own in-memory view); combined with non-atomic writes, a concurrent write can
  also truncate the file. No locking of any kind. (GAP-3.)
- **Edge `strength`/`confidence` are stored verbatim and never used for ordering, and are
  not range-validated** (any number / number-or-null accepted; nothing enforces `[0,1]`).
  Listings sort by key, never by strength. (GAP-5.)
- **Traversal is single-hop only** (`inbound/outboundEdges`); no BFS/DFS/depth-N helpers.
  Multi-hop must be done app-side (build an adjacency map once from `snapshot()`).
- **At rest the file is plaintext** (msgpack; titles/bodies are plain UTF-8). No at-rest
  encryption or field redaction — an application concern. (GAP-11 in the inventory.)
