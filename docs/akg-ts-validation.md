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
