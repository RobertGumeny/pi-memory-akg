# Testing strategy

This suite has two kinds of tests, run separately:

| Suite | Command | What it covers | Touches disk / akg-ts? |
|-------|---------|----------------|------------------------|
| **unit** | `npm run test:unit` | Pure business logic | No — fakes only |
| **integration** | `npm run test:integration` | Tool handlers end-to-end | Yes — real store in a temp dir |

`npm test` runs both; `npm run test:watch` watches. Runner is **Vitest** (native
ESM/TS via esbuild — the engine `tsx` uses, which works here where `ts-node/esm`
did not).

## Unit tests (`test/unit/`)

Test *strictly business logic* — the decision, filtering, formatting, and
transformation functions, in isolation. One test file per unit under test:

- `risk-policy` — every branch of `assessRisk` (confirm-all short-circuit,
  unknown/empty type, low-confidence tags, secret detection, clean → write).
- `retrieval` — `fetchCandidates` route selection, tag intersection, status
  defaults, recency, sort, limit; plus `formatCandidates` / `formatInspect`
  budget and truncation behavior.
- `provenance`, `settings`, `maintenance` (stats + duplicate grouping), and the
  pure helpers `slugify` / `parseRef` / `parseCallerProvenance`.
- **Phase 2 capture pipeline** — `dedup` (`classifyCandidate`), `capture-policy`
  (`routeCandidate`), and `extraction` (`extractCandidates`). The auto-capture
  settings additions are covered in `settings`, the auto-provenance helper in
  `provenance`.

### The injected `LlmFn` pattern (Phase 2 extraction)

Deciding *what* is worth extracting from a free-form summary is a model judgment,
so `extractCandidates` takes an `LlmFn` (`(prompt, opts?) => Promise<string>`) as
a dependency-injected parameter. Unit tests pass a **fake `LlmFn`** — a function
that returns a canned string — and assert the *deterministic* behavior around the
model: JSON/code-fence parsing, per-item validation (drop bad `type`, empty
`title`/`body`, out-of-range `confidence`), the `maxCandidatesPerExtraction` cap,
provenance stamping, and the `[]`-on-malformed / `[]`-on-reject contracts. No
network, no real model. The `auto-capture` integration test wires the same fake
`LlmFn` to a real store + real queue to prove the full extract → dedup → gate →
commit/defer pipeline end-to-end.

The thin adapter that binds a real Pi `ctx.model` to an `LlmFn` lives in
`src/llm.ts` and is intentionally **not** Vitest-tested (see "What we deliberately
do not test"); it is exercised by the guarded `scripts/smoke-llm.ts`.

Conventions:

- **Fakes, not the real store.** Functions that read from a store take a fake
  via `test/helpers/fake-store.ts` (`makeFakeStore`, `makeNode`, `makeEdge`),
  which implements only the akg-ts read accessors over an in-memory array. Units
  never hit the filesystem.
- **Deterministic time.** Functions that call `Date.now()` / `new Date()`
  (`provenance`, `fetchCandidates(sinceMs)`) are tested under
  `vi.useFakeTimers()` + `vi.setSystemTime(...)` — assert exact timestamps, not
  "changed from before".
- **Assert behavior, not wording.** Check the decision/`action`, the returned
  set, the structure — not full output strings. Match a `reason` substring only
  when it identifies the branch.
- **Document actual behavior.** Where a function has a deliberate edge-case
  contract (e.g. `parseRef`'s no-slash fallback to an empty id, or `formatInspect`
  dropping the body when the budget is exhausted), the test pins and comments
  that behavior rather than asserting an idealized version.

## Integration tests (`test/integration/`)

Exercise the tool handlers (`handleRemember`, `handleRecall`, `handleForget`,
`handleLink`) against a **real** akg-ts store, plus a store-lifecycle test. They
prove the orchestration + SDK wiring works; they are deliberately lightweight,
not exhaustive re-tests of the unit-level branches.

Conventions:

- Use `makeTempStore()` from `test/helpers/store.ts` — opens a `MemoryStore` in a
  fresh `os.tmpdir()` directory. Always wire its `cleanup` into `afterEach` so no
  temp dirs leak.
- Assert **observable outcomes** (returned ref strings, node/edge presence on
  re-query, persistence across reopen) — never internal storage layout.

## What we deliberately do not test

- **Constant tables** (`src/schema.ts`) and other tautologies — asserting
  `NODE_TYPES.includes("decision")` tests nothing real.
- **Exact output formatting** beyond what behavior requires — brittle, low value.
- **The Pi extension glue** (`extensions/akg-memory.ts`: session lifecycle, hint
  injection, tool registration, the auto-capture hook wiring and live-turn nudge)
  and **the model adapter** (`src/llm.ts`: binding `ctx.model` to an `LlmFn`) —
  framework/runtime wiring that would require mocking the Pi runtime or hitting a
  real model for little payoff. This is a known, intentional gap, validated
  manually in `docs/phase2-validation.md` and `scripts/smoke-llm.ts`.

## Planned before release (after Phase 3)

- Coverage reporting (Vitest v8 provider) with a `test:coverage` script and a
  threshold.
- A GitHub Actions workflow running `test:unit` and `test:integration` on
  push / PR.

Keep this document in sync when the strategy changes, rather than letting it
drift.
