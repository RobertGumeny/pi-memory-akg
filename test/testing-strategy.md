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
  injection, tool registration) — framework wiring that would require mocking the
  Pi runtime for little payoff. This is a known, intentional gap.

## Planned before release (after Phase 3)

- Coverage reporting (Vitest v8 provider) with a `test:coverage` script and a
  threshold.
- A GitHub Actions workflow running `test:unit` and `test:integration` on
  push / PR.

Keep this document in sync when the strategy changes, rather than letting it
drift.
