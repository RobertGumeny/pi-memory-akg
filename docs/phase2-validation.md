# Phase 2 validation (Epic 2 wiring)

Validates that the Phase 2 capture pipeline is wired into the live Pi extension
(`extensions/akg-memory.ts`) and that the new tools/commands register and behave
safely. See `TASKS.md` P2-012.

- **Pi version:** `0.78.0` (`pi --version`)
- **akg-ts:** `0.1.1`
- **Environment note:** no provider API key was available in the validation
  environment, so the *keyed* extraction round-trip (a compaction summary turning
  into an `unreviewed`/`source:auto` node) is exercised deterministically by the
  Vitest integration test `test/integration/auto-capture.test.ts` (real store +
  real queue + faked `LlmFn`). The RPC run below validates the *wiring and the
  no-model safety path*, mirroring how `scripts/smoke-llm.ts` (P2-011) reports
  `skipped: no model` for the live model call.

## Hooks Fired

Loading the package read-only in print mode (`pi -e ./ -p "hello" --offline
--no-session`) and in RPC mode shows the lifecycle hooks fire and the candidate
queue opens alongside the store (observed on stderr):

```
[akg-memory] session_start fired: opened .../.pi/memory.akg, queue .../.pi/memory-candidates.jsonl
[akg-memory] before_agent_start fired
[akg-memory] auto-capture (compaction): committed 0, deferred 0, dropped 0, duplicates 0
[akg-memory] session_shutdown fired: committed and closed
```

No manifest/discovery errors. `session_start` opens both the store and the
`CandidateQueue` and builds the `LlmFn` from `ctx.model` + `ctx.modelRegistry`.

### Tool & command registration

RPC `get_commands` (`echo '{"type":"get_commands"}' | pi -e ./ --mode rpc
--no-session --offline`) lists the new extension commands (observed):

```
{"name":"memory-status"} {"name":"memory-review"} {"name":"memory-revert"}
```

(`--list-tools` does not exist in Pi 0.78.0; the `memory_review` / `memory_revert`
tools register in the same extension factory that registers these commands, which
loaded without error. Their handlers are covered by
`test/integration/review.test.ts` and `test/integration/revert.test.ts`.)

The `akg-memory` skill and the `memory-review` / `memory-status` / `memory-cleanup`
prompt templates also resolve in the same `get_commands` output.

## Auto-Capture (headless)

Forcing a compaction over RPC in a headless session and then querying state:

```
$ { echo '{"type":"compact","id":"c1"}'; sleep 5; echo '{"type":"get_state","id":"s1"}'; } \
    | pi -e ./ --mode rpc --no-session --offline
{"type":"response","command":"compact","success":true,...}
{"type":"response","command":"get_state","success":true,"data":{...,"sessionId":"019e7b8f-..."}}
```

The `session_compact` hook fired and `captureFromSummary` ran the pipeline. With
no model available, `makeLlmFn` rejects, `extractCandidates` catches it and
returns `[]`, so the run reported `committed 0, deferred 0, dropped 0,
duplicates 0` (see stderr above). Crucially:

- The session **stayed alive** — the subsequent `get_state` succeeded.
- **Nothing was written** to the graph — `Store.open('.pi/memory.akg')` after the
  run reported `nodes: 0`.

This satisfies the acceptance criterion *"Inducing an extraction failure (e.g. no
model) leaves the session running and writes nothing to the graph."*

The successful-capture behavior (headless `auto-commit` default → one
`unreviewed`/`source:auto` node committed, a secret-like candidate deferred to the
queue; interactive → everything deferred) is proven deterministically in
`test/integration/auto-capture.test.ts`. The RPC path feeds the identical
`runAutoCapture` engine; only the `LlmFn` binding (`src/llm.ts`, P2-011) differs,
and that binding is smoke-tested separately by `scripts/smoke-llm.ts`.

## Review Flow

- `/memory-review` (command) → `runInteractiveReview`: with UI, walks each pending
  candidate offering accept / reject / skip; with no UI, notifies and points at the
  `memory_review` tool.
- `memory_review` tool → `handleReview` with `action: "list" | "accept" | "reject"`.
  `accept` promotes a candidate to an `active` graph node (optionally edited) and
  removes it from the queue; `reject` discards it. Atomic per candidate (graph
  write + commit precede queue removal). Covered by `test/integration/review.test.ts`.

## Revert Flow

- `/memory-revert [delete]` (command) → `runInteractiveRevert`: shows the dry-run,
  confirms, then reverts.
- `memory_revert` tool → `handleRevert`. Without `confirm` it returns a dry-run
  summary of the matching `unreviewed`/`source:auto` nodes; with `confirm: true` it
  applies a **forward forget** (default `deactivate`, or cascade `delete`) — never a
  WAL rollback. Optional `origin` / `sinceMs` narrowing. Covered by
  `test/integration/revert.test.ts`.
