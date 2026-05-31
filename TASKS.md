# TASKS: pi-memory-akg Implementation

Source: `PRD.md` (Status: Implementation-ready, 2026-05-28)  
Phases in scope: Phase 0 (baseline validation), Phase 1 (explicit memory tools), and Phase 2 (selective automatic extraction).  
Phase 3 is documented in `PRD.md §12` but not broken down here.

**Status:** Phase 0 (P0-001..006) and Phase 1 (P1-001..018) are complete, with a Vitest unit + integration baseline in place. **Phase 2 · Epic 1 — Capture pipeline (P2-001..007) is complete** (settings, sidecar candidate queue, auto-capture provenance, dedup, LLM extraction, capture-policy gate, and auto-capture orchestration; all unit/integration-tested with a faked `LlmFn`). Phase 2 · Epic 2 (P2-008..015) remains the next batch.

**Toolchain note (validated 2026-05-30):** Running Pi is **0.78.0**; `@earendil-works/pi-coding-agent` and `@earendil-works/pi-ai` are installed as devDependencies at `^0.78.0` so types resolve. The test runner is **Vitest** (`npm test`, `npm run test:unit`, `npm run test:integration`). Standalone scripts run under `npx tsx`; type-check with `npx tsc --noEmit`. **`node --loader ts-node/esm` does NOT work in this repo** — do not use it in acceptance criteria (the Phase 1 criteria that reference it are superseded by Vitest/tsx).

---

## How to read this file

- Tasks within a phase are ordered by dependency. Do not start a task until all listed **Depends on** tasks are complete.
- Acceptance criteria use the form: _command / observable output_ — not assertions about quality.
- Each task is sized for a single agent session. If a task requires the agent to invent an interface not specified here or in `PRD.md`, stop and raise the ambiguity.

---

## Phase 0 — SDK and Pi Package Baseline Validation

**Goal:** Confirm the package can be loaded as a real Pi package, all lifecycle hooks fire, and the `akg-ts` SDK public API works as expected. No memory business logic yet.

Exit criteria: repo loads with `pi -e ./`; extension registers and executes a placeholder tool; `/memory-status` renders placeholder status; `akg-ts` resolves from dependencies; SDK API surface validated without relying on non-public internals.

---

### P0-001 — Create package skeleton

**Output:** A valid Pi package directory tree at `pi-memory-akg/` with all top-level directories and a minimal `package.json`.

**Spec:**
- Create the directory layout from `PRD.md §13`:
  ```
  extensions/
  skills/akg-memory/
  prompts/
  src/tools/
  ```
- `package.json` must include:
  - `"keywords": ["pi-package"]`
  - `"type": "module"`
  - `"dependencies": { "akg-ts": "^0.0.0" }` (version to be updated in P0-005)
  - `"peerDependencies"` with `"*"` ranges for `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, and `typebox`
  - `"pi"` manifest pointing to `./extensions`, `./skills`, `./prompts`
- Add placeholder empty files: `extensions/akg-memory.ts`, `skills/akg-memory/SKILL.md`

**Acceptance criteria:**
- `cat package.json | node -e "const p=require('/dev/stdin');console.log(p.keywords.includes('pi-package'))"` prints `true`.
- `cat package.json | node -e "const p=require('/dev/stdin');console.log(!!p.pi?.extensions)"` prints `true`.
- `ls extensions/akg-memory.ts skills/akg-memory/SKILL.md` exits 0.
- `node --input-type=module < /dev/null` does not error (confirms `"type":"module"` is parseable by node).

---

### P0-002 — Implement minimal extension with placeholder tool and lifecycle stubs

**Depends on:** P0-001

**Output:** `extensions/akg-memory.ts` registers one no-op `memory_remember` placeholder tool and stubs for `session_start`, `before_agent_start`, and `session_shutdown` hooks that log to stderr.

**Spec:**
- The extension must export a default Pi extension object compatible with the Pi extension API.
- `session_start`: log `[akg-memory] session_start fired` to stderr.
- `before_agent_start`: log `[akg-memory] before_agent_start fired` to stderr.
- `session_shutdown`: log `[akg-memory] session_shutdown fired` to stderr.
- `memory_remember` placeholder tool: accepts `{ type, title, body }` and returns `{ content: "placeholder: not yet implemented" }`.
- No real AKG logic yet.

**Acceptance criteria:**
- `pi -e ./ --list-tools 2>/dev/null | grep memory_remember` returns a non-empty line (tool is discoverable).
- Starting Pi with `pi -e ./` and immediately shutting down produces at least `[akg-memory] session_start fired` and `[akg-memory] session_shutdown fired` in stderr output.
- Calling the `memory_remember` placeholder tool via Pi returns content containing `"placeholder: not yet implemented"`.

---

### P0-003 — Implement placeholder `/memory-status` extension command

**Depends on:** P0-002

**Output:** `/memory-status` is registered as a Pi extension command that returns hardcoded placeholder status text.

**Spec:**
- Register `/memory-status` (or the Pi-idiomatic equivalent) as a command in `extensions/akg-memory.ts`.
- The command returns deterministic static text: `"Memory status: placeholder — AKG not yet initialized."` plus the current `cwd`.
- No live AKG reads yet.

**Acceptance criteria:**
- `pi -e ./ --list-commands 2>/dev/null | grep memory-status` returns a non-empty line.
- Running `/memory-status` from a Pi session returns a string containing `"Memory status: placeholder"`.
- Running `/memory-status` from a Pi session returns a string containing the absolute path of the current working directory.

---

### P0-004 — Validate `pi -e ./` package loading end-to-end

**Depends on:** P0-003

**Output:** A written validation note in `docs/phase0-validation.md` confirming loading, resource discovery, hook firing, and tool execution results.

**Spec:**
- Load the package with `pi -e ./` in the repo root.
- Confirm Pi discovers: the extension (`akg-memory`), the skill (`akg-memory`), and the prompts directory without manifest errors.
- Confirm `pi list` shows the package.
- Confirm all three lifecycle hooks log their messages when a session starts and ends.
- Confirm the `memory_remember` placeholder tool executes and returns its placeholder result.
- Confirm `/memory-status` returns its placeholder output.
- Document the exact `pi` version used and any observed discrepancies.

**Acceptance criteria:**
- `pi -e ./ list 2>/dev/null | grep pi-memory-akg` returns a non-empty line.
- `docs/phase0-validation.md` exists and contains the section headings: `## Loading`, `## Lifecycle Hooks`, `## Tool Execution`, `## Command Execution`.
- `docs/phase0-validation.md` records the `pi` version string.

---

### P0-005 — Validate `akg-ts` SDK API surface

**Depends on:** P0-001

**Output:** A written SDK validation note in `docs/akg-ts-validation.md` confirming each required public API works and documenting limitations.

**Spec:**
- Install `akg-ts` as a dependency and confirm the import resolves.
- Write a standalone validation script `scripts/validate-akg-ts.ts` that:
  1. Opens a temporary `.akg` file.
  2. Creates a node, reads it back, updates it, deletes it.
  3. Calls `compact()`.
  4. Calls `recentNodes()` and `recentEdges()`.
  5. Calls `listNodesFiltered()`, `getNodes()`, `listEdges()`, `snapshot()`.
  6. Tests inbound/outbound edge traversal.
  7. Verifies edge `strength` defaults to `0.5` when not specified.
  8. Verifies `deleteNode()` rejects a node with live edges (non-cascade).
  9. Verifies `deleteNodeCascade()` removes the node and its edges.
  10. Confirms single-writer behavior: documents whether the SDK throws, silently queues, or has no runtime protection if two store instances open the same file.
- Record results in `docs/akg-ts-validation.md`.
- Pin the validated `akg-ts` version in `package.json`.

**Acceptance criteria:**
- `node --loader ts-node/esm scripts/validate-akg-ts.ts` (or equivalent run command) exits 0.
- `docs/akg-ts-validation.md` exists and contains sections: `## API Coverage`, `## Edge Strength Default`, `## Delete Behavior`, `## Single-Writer Semantics`, `## Limitations`.
- `docs/akg-ts-validation.md` explicitly states: "Full-text/lexical search over node title/body is not available in the SDK."
- `package.json` `dependencies.akg-ts` is pinned to a specific validated version (not `^0.0.0`).

---

### P0-006 — Document write-serialization decision

**Depends on:** P0-005

**Output:** A decision record in `docs/phase0-validation.md` (appended) stating whether Phase 1 needs a package-level write queue or lock-file protection.

**Spec:**
- Based on P0-005 findings, determine: does the SDK provide any runtime protection if the same `.pi/memory.akg` is opened by two writers? If not, does Phase 1 need an internal write queue?
- Decision must be binary: "Phase 1 will / will not use an internal write queue" with a one-sentence rationale.
- If a write queue is needed, add a placeholder `src/write-queue.ts` stub (empty module) so Phase 1 tasks can depend on it.

**Acceptance criteria:**
- `docs/phase0-validation.md` contains the section `## Write-Serialization Decision` with a sentence containing either "will use an internal write queue" or "will not use an internal write queue".
- If the decision is "will use", `ls src/write-queue.ts` exits 0.

---

## Phase 1 — Explicit Memory Tools and Agent-Directed Retrieval

**Goal:** Users and agents can deliberately store, recall, inspect, link, and maintain durable project memory. Memory survives across Pi sessions. Package is usable locally as a Pi package.

**Depends on:** All Phase 0 tasks complete (exit criteria met).

Exit criteria: memory survives across Pi sessions; recall improves continuity without transcript mirroring; package is usable locally as a Pi package.

---

### P1-001 — Implement `src/schema.ts`

**Output:** `src/schema.ts` exports all node types, relation types, standard tags, and metadata field definitions from `PRD.md §6.5` as TypeScript constants or enums.

**Spec:**
- Node types (as a `const` or enum): `project`, `session`, `decision`, `constraint`, `preference`, `task`, `artifact`, `file`, `concept`, `pattern`.
- Relation types: `affects`, `depends_on`, `blocks`, `implements`, `documents`, `derived_from`, `supersedes`, `relevant_to`.
- Standard tags: `durable`, `active`, `user_pref`, `repo_fact`, `workflow`, `bug`, `design`.
- Metadata field names as string constants: `cwd`, `session_id`, `entry_ids`, `source`, `status`, `confidence_reason`, `last_seen_at`.
- All exports must be type-safe TypeScript (no `any`).

**Acceptance criteria:**
- `tsc --noEmit` on the file exits 0.
- `grep -c "NodeType\|RelationType\|MemoryTag" src/schema.ts` returns 3 or more (confirming distinct export groups exist).
- `node --loader ts-node/esm -e "import { NODE_TYPES } from './src/schema.ts'; console.log(NODE_TYPES.includes('decision'))"` prints `true`.
- `node --loader ts-node/esm -e "import { RELATION_TYPES } from './src/schema.ts'; console.log(RELATION_TYPES.includes('supersedes'))"` prints `true`.

---

### P1-002 — Implement `src/settings.ts`

**Output:** `src/settings.ts` exports a settings schema and defaults for all package-configurable values from `PRD.md §5.4` and `§8`.

**Spec:**
- Settings must include:
  - `hintEnabled: boolean` (default `true`)
  - `hintBudget: number` (default `400`, in characters)
  - `toolResultBudget: number` (default `6000`, in characters)
  - `requireConfirmationForAll: boolean` (default `false`) — the "stricter ask-before-every-write" option
  - `memoryFilePath: string` (default `.pi/memory.akg`, relative to `cwd`)
- Export a `loadSettings(overrides?: Partial<Settings>): Settings` function that merges overrides with defaults.

**Acceptance criteria:**
- `tsc --noEmit` on the file exits 0.
- `node --loader ts-node/esm -e "import { loadSettings } from './src/settings.ts'; const s = loadSettings(); console.log(s.hintBudget)"` prints `400`.
- `node --loader ts-node/esm -e "import { loadSettings } from './src/settings.ts'; const s = loadSettings({ hintBudget: 200 }); console.log(s.hintBudget)"` prints `200`.
- `node --loader ts-node/esm -e "import { loadSettings } from './src/settings.ts'; const s = loadSettings(); console.log(s.hintEnabled)"` prints `true`.

---

### P1-003 — Implement `src/provenance.ts`

**Output:** `src/provenance.ts` exports helpers that assemble provenance metadata records from Pi session context.

**Spec:**
- Export `buildProvenance(ctx: { cwd?: string; sessionId?: string; entryIds?: string[]; source?: string }): ProvenanceMetadata`.
- `ProvenanceMetadata` must include: `cwd`, `session_id`, `entry_ids`, `source`, `last_seen_at` (ISO timestamp).
- Omit undefined fields rather than storing `undefined`.
- Export `mergeProvenance(existing: ProvenanceMetadata, update: Partial<ProvenanceMetadata>): ProvenanceMetadata` that updates `last_seen_at` when merging.

**Acceptance criteria:**
- `tsc --noEmit` on the file exits 0.
- `node --loader ts-node/esm -e "import { buildProvenance } from './src/provenance.ts'; const p = buildProvenance({ cwd: '/repo', source: 'manual' }); console.log(typeof p.last_seen_at)"` prints `string`.
- `node --loader ts-node/esm -e "import { buildProvenance } from './src/provenance.ts'; const p = buildProvenance({ cwd: '/repo' }); console.log('session_id' in p)"` prints `false` (undefined fields omitted).
- `node --loader ts-node/esm -e "import { mergeProvenance } from './src/provenance.ts'; const a = { cwd: '/repo', last_seen_at: '2000-01-01T00:00:00Z' }; const b = mergeProvenance(a, { source: 'manual' }); console.log(b.last_seen_at !== '2000-01-01T00:00:00Z')"` prints `true`.

---

### P1-004 — Implement `src/memory-store.ts`

**Depends on:** P0-005, P0-006, P1-001, P1-002

**Output:** `src/memory-store.ts` manages the AKG file lifecycle: open, commit, close, and (if P0-006 requires it) write serialization.

**Spec:**
- Export `class MemoryStore` with:
  - `static open(cwd: string, settings: Settings): Promise<MemoryStore>` — opens or creates `.pi/memory.akg` at `path.join(cwd, settings.memoryFilePath)`.
  - `commit(): Promise<void>` — flushes pending changes.
  - `close(): Promise<void>` — commits and closes.
  - `readonly isOpen: boolean`
  - `readonly filePath: string`
  - Internal access to the underlying `akg-ts` store instance for use by tool modules.
- If P0-006 determined a write queue is needed, all mutations must go through the internal queue.
- If the file cannot be opened, `open()` must throw with a message of the form: `"[akg-memory] Cannot open memory file at <path>: <reason>"`.

**Acceptance criteria:**
- `tsc --noEmit` exits 0.
- A script that calls `MemoryStore.open('/tmp/test-akg-XXXX', loadSettings())` and then `store.close()` exits 0 and leaves a file at the expected path.
- A script that calls `open()` with a non-writable path catches an error with message matching `/Cannot open memory file/`.
- `store.isOpen` is `true` after `open()` and `false` after `close()`.

---

### P1-005 — Implement `src/risk-policy.ts`

**Depends on:** P1-001

**Output:** `src/risk-policy.ts` exports a function that classifies a memory write request as safe-to-write, needs-confirmation, or blocked-non-interactive.

**Spec:**
- Export `assessRisk(record: { type: string; title: string; body: string; tags?: string[] }, uiAvailable: boolean, settings: Settings): RiskAssessment`.
- `RiskAssessment` is one of:
  - `{ action: "write" }` — normal project memory, write directly.
  - `{ action: "confirm", reason: string }` — sensitive/secret-like/low-confidence/ambiguous; ask user when `uiAvailable`.
  - `{ action: "reject", reason: string }` — `uiAvailable` is false and risk is non-trivial; return actionable guidance.
- Triggers for `confirm`/`reject` (per `PRD.md §10 FR3`):
  - Body or title contains patterns matching secrets (e.g., tokens, passwords, API keys, private keys).
  - Tags include a `confidence:low` or similar low-confidence marker.
  - Type is ambiguous (empty or not in `NODE_TYPES`).
- If `settings.requireConfirmationForAll` is `true`, all writes return `{ action: "confirm", reason: "ask-before-every-write enabled" }`.

**Acceptance criteria:**
- `tsc --noEmit` exits 0.
- `assessRisk({ type: "decision", title: "Use AKG", body: "AKG is durable memory." }, true, loadSettings())` returns `{ action: "write" }`.
- `assessRisk({ type: "decision", title: "API Key", body: "key is sk-abc123" }, true, loadSettings())` returns an object with `action: "confirm"`.
- `assessRisk({ type: "decision", title: "API Key", body: "key is sk-abc123" }, false, loadSettings())` returns an object with `action: "reject"`.
- `assessRisk({ type: "decision", title: "Normal fact", body: "something" }, true, loadSettings({ requireConfirmationForAll: true }))` returns an object with `action: "confirm"`.

---

### P1-006 — Implement `src/retrieval.ts`

**Depends on:** P1-001, P1-004

**Output:** `src/retrieval.ts` exports candidate generation and compact result formatting functions used by recall, recent, and inspect tools.

**Spec:**
- Export `fetchCandidates(store: MemoryStore, filters: RecallFilters): Promise<MemoryRecord[]>` where `RecallFilters` supports: `types`, `tags`, `ids`, `status`, `limit`, `sinceMs` (for recency), `neighborOf` (node id for graph neighborhood).
- Export `formatCandidates(records: MemoryRecord[], budget: number): string` — returns a compact newline-delimited summary. Each record gets one line: `[type] title (id: <id>, tags: ..., status: ...)`. Truncates if total length exceeds `budget`.
- Export `formatInspect(record: MemoryRecord, edges: Edge[], budget: number): string` — deterministic multi-line format for a single record with edges. Truncates body deterministically (not mid-word) if over budget.
- No full-text/lexical search (confirmed unavailable per P0-005).

**Acceptance criteria:**
- `tsc --noEmit` exits 0.
- A script that creates two decision nodes, calls `fetchCandidates` with `{ types: ["decision"] }`, and logs results returns exactly 2 records.
- `formatCandidates(records, 100)` returns a string with byte length ≤ 100 when records would otherwise exceed 100 characters.
- `fetchCandidates` with `{ limit: 1 }` when 3 nodes exist returns exactly 1 record.
- `fetchCandidates` with `{ status: "active" }` does not return nodes whose `status` metadata is `"inactive"`.

---

### P1-007 — Implement `src/maintenance.ts`

**Depends on:** P1-001, P1-004

**Output:** `src/maintenance.ts` exports helpers for memory status reporting and compaction.

**Spec:**
- Export `getMemoryStats(store: MemoryStore): Promise<MemoryStats>` where `MemoryStats` includes:
  - `totalNodes: number`
  - `countsByType: Record<string, number>`
  - `countsByStatus: Record<string, number>`
  - `recentTitles: string[]` (last 5 by update time)
  - `filePath: string`
- Export `runCompact(store: MemoryStore): Promise<void>` — calls `store.compact()` and logs result.
- Export `findDuplicateCandidates(store: MemoryStore): Promise<DuplicateCandidate[]>` — returns pairs of nodes with identical titles and types. Does not modify the store.

**Acceptance criteria:**
- `tsc --noEmit` exits 0.
- A script that creates 3 `decision` nodes and 1 `constraint` node, calls `getMemoryStats`, and checks `countsByType.decision` returns `3`.
- A script that creates 2 nodes with identical `type` and `title`, calls `findDuplicateCandidates`, and checks the result length returns `1` (one pair found).
- `runCompact` on a store with committed nodes exits without throwing.

---

### P1-008 — Implement `src/tools/remember.ts`

**Depends on:** P1-003, P1-004, P1-005

**Output:** `src/tools/remember.ts` implements the `memory_remember` tool handler.

**Spec (per `PRD.md §5.2`, `§10 FR3`):**
- Input schema: `{ type, title, body, tags?, provenance? }`.
- Calls `assessRisk`; if `action: "write"`, creates or updates the node.
- Stable identity: if a node with the same `type` and `title` already exists (by exact match), update it rather than creating a new node. Attach `supersedes` edge if the caller provides an explicit `ref` to replace.
- Attaches provenance metadata from `buildProvenance` merged with any caller-supplied provenance.
- Returns on success: `"Remembered <type>: <title>\nref: <type>/<stable-slug>"`.
- Returns on confirm-needed: `"Confirmation required before storing this memory: <reason>. Use memory_remember with explicit confirm: true to proceed."` (does not write).
- Returns on reject: `"Cannot store memory without user confirmation: <reason>."`.
- Generates a stable slug from `<type>/<title>` (lowercase, spaces to hyphens, truncated to 60 chars).

**Acceptance criteria:**
- Calling the tool with `{ type: "decision", title: "Use AKG", body: "AKG is durable memory." }` returns a string matching `/^Remembered decision:/`.
- Calling it again with the same `type` and `title` returns a string matching `/^Remembered decision:/` and does not create a second node (total decision count stays 1).
- Calling it with a secret-like body (e.g., `body: "token: ghp_abc123"`) without `confirm: true` returns a string matching `/Confirmation required/`.
- Calling it with `confirm: true` and a secret-like body writes the node and returns a string matching `/^Remembered/`.
- The created node has `cwd` and `last_seen_at` set in its metadata.

---

### P1-009 — Implement `src/tools/recall.ts`

**Depends on:** P1-006

**Output:** `src/tools/recall.ts` implements the `memory_recall` tool handler.

**Spec (per `PRD.md §5.3`, `§10 FR4`):**
- Input schema: `{ types?, tags?, ids?, limit?, neighborOf?, status? }`.
- Calls `fetchCandidates`, then formats with `formatCandidates(results, settings.toolResultBudget)`.
- Default `limit`: 10; maximum `limit`: 50.
- Does not perform full-text search.
- Returns `"No matching memories found."` when result set is empty.
- Prepends `"Relevant memory:\n"` to non-empty results.

**Acceptance criteria:**
- Calling `memory_recall({ types: ["decision"] })` with 3 decision nodes and 2 constraint nodes returns exactly 3 entries.
- Calling `memory_recall({ limit: 2 })` with 5 total nodes returns at most 2 entries.
- The result string starts with `"Relevant memory:\n"` when records are found.
- The result byte length does not exceed `settings.toolResultBudget`.
- Calling with no matching filters returns `"No matching memories found."`.

---

### P1-010 — Implement `src/tools/link.ts`

**Depends on:** P1-004

**Output:** `src/tools/link.ts` implements the `memory_link` tool handler.

**Spec (per `PRD.md §10 FR5`):**
- Input schema: `{ fromId, toId, relation, strength? }`.
- `relation` must be one of `RELATION_TYPES` from `schema.ts`.
- Verifies both `fromId` and `toId` exist before creating the edge. If either is missing, returns an error and makes no mutation.
- Creates the edge with `strength` defaulting to `0.5`.
- Returns on success: `"Linked <fromId> -[<relation>]-> <toId>"`.
- Returns on missing ID: `"Error: node '<id>' not found. No link created."`.

**Acceptance criteria:**
- Linking two existing nodes returns a string matching `/^Linked /`.
- Calling `memory_inspect` on `fromId` after linking shows the new edge.
- Linking with a non-existent `toId` returns a string matching `/Error: node .* not found/` and leaves `fromId` edges unchanged.
- Linking with an invalid `relation` (not in `RELATION_TYPES`) returns an error string and makes no mutation.

---

### P1-011 — Implement `src/tools/forget.ts`

**Depends on:** P1-004

**Output:** `src/tools/forget.ts` implements the `memory_forget` tool handler.

**Spec (per `PRD.md §10 FR6`):**
- Input schema: `{ id, mode?: "deactivate" | "supersede" | "delete", supersededBy?: string, cascade?: boolean }`.
- Default `mode`: `"deactivate"` — sets node metadata `status: "inactive"`.
- `"supersede"` — sets `status: "superseded"` and, if `supersededBy` is provided, creates a `supersedes` edge from `supersededBy` to `id`.
- `"delete"` — requires confirmation when UI is available (`uiAvailable`). Uses `deleteNodeCascade()` if `cascade: true`, else `deleteNode()` (which will fail if live edges exist — surface the error).
- Returns on deactivate/supersede: `"Forgot <id> (status: <new-status>)"`.
- Returns on delete success: `"Deleted <id>"`.
- Returns when delete fails due to live edges: `"Cannot delete <id>: node has live edges. Use cascade: true to force deletion or deactivate instead."`.

**Acceptance criteria:**
- Calling `memory_forget({ id: "task/x" })` sets that node's status to `"inactive"` and returns `"Forgot task/x (status: inactive)"`.
- After forgetting, `memory_recall({ types: ["task"] })` without explicit `status` filter does not return `"task/x"`.
- `memory_inspect({ id: "task/x" })` still returns the node with `status: inactive` when inspected directly.
- Calling `memory_forget({ id: "task/y", mode: "delete" })` on a node with live edges returns a string matching `/Cannot delete.*live edges/`.
- Calling `memory_forget({ id: "task/y", mode: "delete", cascade: true })` with a node with live edges returns `"Deleted task/y"` and the node no longer exists.

---

### P1-012 — Implement `src/tools/recent.ts`

**Depends on:** P1-006

**Output:** `src/tools/recent.ts` implements the `memory_recent` tool handler.

**Spec (per `PRD.md §10 FR7`):**
- Input schema: `{ limit?, types?, tags?, status? }`.
- Returns records ordered by `last_seen_at` descending (most recent first).
- Default `limit`: 10.
- Formats results with `formatCandidates(results, settings.toolResultBudget)`.
- Prepends `"Recent memory:\n"` to non-empty results.
- Returns `"No recent memories found."` for empty results.

**Acceptance criteria:**
- Creating nodes A, B, C in sequence (A oldest, C newest), calling `memory_recent({ limit: 2 })` returns B and C (not A).
- The result string starts with `"Recent memory:\n"`.
- `memory_recent({ types: ["decision"] })` with 2 decisions and 3 constraints returns at most 2 entries.
- Result byte length does not exceed `settings.toolResultBudget`.

---

### P1-013 — Implement `src/tools/inspect.ts`

**Depends on:** P1-006

**Output:** `src/tools/inspect.ts` implements the `memory_inspect` tool handler.

**Spec (per `PRD.md §10 FR7`):**
- Input schema: `{ id }`.
- Returns full node data, metadata, and related edges using `formatInspect`.
- If `id` does not exist, returns `"No memory found with id '<id>'."`.
- Truncates body deterministically at `settings.toolResultBudget` characters if needed.

**Acceptance criteria:**
- `memory_inspect({ id: "decision/use-akg" })` on an existing node returns a string containing the node's title, type, tags, and status.
- `memory_inspect({ id: "decision/use-akg" })` after linking another node to it returns output containing the relation type of the edge.
- `memory_inspect({ id: "nonexistent" })` returns a string matching `/No memory found with id/`.
- Return value byte length does not exceed `settings.toolResultBudget`.

---

### P1-014 — Implement `src/tools/status.ts` (extension command handler)

**Depends on:** P1-007, P1-002

**Output:** `src/tools/status.ts` implements the `/memory-status` command handler with deterministic live data from `getMemoryStats`.

**Spec (per `PRD.md §5.5`, `§10 FR10`):**
- Returns a formatted status block containing:
  - Memory enabled: yes/no
  - Memory file path (absolute)
  - Hint state: enabled/disabled, budget
  - Tool result budget
  - Approximate counts by type and status
  - Last 5 recent memory titles
  - Gitignore recommendation: `"Recommendation: add .pi/memory.akg to .gitignore for private/local memory."`
  - Available tools list
  - Suggested next actions (e.g., "Run memory_recall to explore existing memories.")
- Does not dump full memory record content.
- If store is not yet initialized, returns a message indicating memory is not yet active.

**Acceptance criteria:**
- Running `/memory-status` after creating 3 nodes returns output containing `"3"` in the counts section.
- Output contains the string `"memory_recall"` in the available tools list.
- Output contains the substring `".gitignore"`.
- Output byte length does not exceed `settings.toolResultBudget * 2` (status is allowed up to 2× the per-tool budget as it is a structured report).
- Running `/memory-status` before any memory writes returns output containing `"Memory status"` and does not throw.

---

### P1-015 — Wire all tools into `extensions/akg-memory.ts`

**Depends on:** P1-004, P1-008, P1-009, P1-010, P1-011, P1-012, P1-013, P1-014

**Output:** `extensions/akg-memory.ts` is fully implemented: opens the memory store on `session_start`, injects the hint on `before_agent_start`, registers all 6 tools and the `/memory-status` command, and commits/closes on `session_shutdown`.

**Spec:**
- `session_start`: call `MemoryStore.open(ctx.cwd, settings)`. If open fails, log the error to stderr, disable memory tools, and surface a clear message to the user (do not crash the session).
- `before_agent_start`: if `settings.hintEnabled` and store is open, inject a hidden hint capped at `settings.hintBudget` characters. Exact hint text (from `PRD.md §5.4`): `Project AKG memory is available at .pi/memory.akg. Use memory_recall, memory_recent, or memory_inspect when durable project context may affect this task.` — truncate to budget if needed.
- Register tools: `memory_remember`, `memory_recall`, `memory_link`, `memory_forget`, `memory_recent`, `memory_inspect`.
- Register command: `/memory-status`.
- `session_shutdown`: call `store.commit()` then `store.close()`. Log result or error to stderr.
- Remove placeholder stubs from P0-002 and P0-003.

**Acceptance criteria:**
- `pi -e ./ --list-tools 2>/dev/null | grep -E "memory_remember|memory_recall|memory_link|memory_forget|memory_recent|memory_inspect"` returns 6 lines.
- Starting Pi, calling `memory_remember` with a valid decision, exiting Pi, restarting Pi, and calling `memory_recall` returns the previously stored decision.
- `before_agent_start` hint length in the injected context does not exceed `settings.hintBudget` characters.
- If `.pi/memory.akg` is intentionally made unreadable before `session_start`, the session starts without crashing and tools return a message indicating memory is unavailable.
- `session_shutdown` leaves the `.pi/memory.akg` file readable (valid AKG format) after `store.close()`.

---

### P1-016 — Write `skills/akg-memory/SKILL.md`

**Depends on:** P1-015 (to reflect final tool surface)

**Output:** `skills/akg-memory/SKILL.md` contains the selective durable memory policy from `PRD.md §6.3`.

**Spec — the skill must cover (per `PRD.md §6.3`):**
1. What qualifies as durable memory (decisions, constraints, preferences, tasks, artifacts, repo facts, relationships).
2. What must NOT be stored (every message, raw tool output, full transcripts, low-confidence facts without confidence metadata).
3. When to update, supersede, link, or forget an existing memory (prefer update over duplicate).
4. How to preserve provenance and uncertainty (always set `confidence_reason` for inferred facts).
5. How to use each memory tool safely (one paragraph or example per tool).
6. How to keep memory compact (prefer superseding over accumulating stale records).
7. At least 3 positive memory examples and 3 negative (should-not-store) examples.

**Acceptance criteria:**
- `pi -e ./ --list-skills 2>/dev/null | grep akg-memory` returns a non-empty line.
- `grep -c "memory_remember\|memory_recall\|memory_link\|memory_forget\|memory_recent\|memory_inspect" skills/akg-memory/SKILL.md` returns 6 or more.
- `grep -i "do not\|must not\|avoid" skills/akg-memory/SKILL.md` returns at least 3 lines (negative guidance present).
- Word count of the file is between 400 and 2000 words (`wc -w skills/akg-memory/SKILL.md`).

---

### P1-017 — Write prompt templates

**Output:** Three prompt files: `prompts/memory-status.md`, `prompts/memory-review.md`, `prompts/memory-cleanup.md`.

**Spec:**
- `prompts/memory-status.md`: lightweight model-assisted status interpretation. Instructs the model to call `/memory-status` and interpret the output for the user. Does not duplicate the status data itself.
- `prompts/memory-review.md`: guides a session-end memory review. Instructs the model to call `memory_recent` and `memory_recall`, identify what new durable facts emerged, and propose `memory_remember` calls for the user to confirm.
- `prompts/memory-cleanup.md`: guides curation. Instructs the model to call `memory_recall` and `maintenance` tools, identify duplicates and superseded records, and propose `memory_forget`/`memory_link` actions without executing them automatically.

**Acceptance criteria:**
- `ls prompts/memory-status.md prompts/memory-review.md prompts/memory-cleanup.md` exits 0.
- `pi -e ./ --list-prompts 2>/dev/null | grep -c "memory-status\|memory-review\|memory-cleanup"` returns 3.
- Each prompt file references at least one `memory_*` tool by name (`grep -l "memory_" prompts/*.md | wc -l` returns 3).

---

### P1-018 — Write `README.md`

**Depends on:** P1-015, P1-016, P1-017

**Output:** `README.md` at the repo root with install instructions, development usage, memory policy summary, and gitignore recommendation.

**Spec — README must contain:**
1. Install command: `pi install git:github.com/rgumeny/pi-memory-akg`
2. Dev usage: `pi -e ./packages/pi-memory-akg` (or `pi -e ./` from repo root)
3. What memory is stored (brief, links to `SKILL.md` for full policy)
4. The `.pi/memory.akg` path and the gitignore recommendation
5. List of all 6 tools with one-line descriptions
6. List of slash prompts with one-line descriptions
7. Phase roadmap (brief, links to `PRD.md` for full detail)

**Acceptance criteria:**
- `grep "pi install" README.md` returns a non-empty line.
- `grep "memory_remember\|memory_recall\|memory_link\|memory_forget\|memory_recent\|memory_inspect" README.md | wc -l` returns 6.
- `grep ".gitignore" README.md` returns a non-empty line.
- `grep "PRD.md" README.md` returns a non-empty line.

---

## Phase 2 — Selective Automatic Extraction

**Goal:** The package automatically *suggests or captures* durable memories from completed work while staying low-noise. Capture is transparent, provenance-stamped, and reversible — the user (or an orchestrator) can always see what was captured, why, and undo it.

**Depends on:** All Phase 1 tasks complete (the six tools, store lifecycle, retrieval, risk-policy, maintenance, and the Vitest baseline).

**Delivered as two sequential epics** (see `PRD.md §12`):

- **Epic 1 — Capture pipeline (P2-001 … P2-007):** the engine that turns a distilled summary into committed/deferred candidates. Fully testable with a faked `LlmFn`; no live model or Pi wiring required.
- **Epic 2 — Control surface & integration (P2-008 … P2-015):** review/revert tools + commands, status/maintenance, the live model adapter, extension hook wiring + nudge, and docs.

Epic 1 must complete before Epic 2 (Epic 2 consumes the Epic 1 modules).

### Resolved Phase 2 design decisions

These were resolved in the planning session of 2026-05-30 and govern every task below. They extend, and where noted reinterpret, `PRD.md §12`:

1. **Hybrid extraction.** A bounded **LLM extraction pass** runs on Pi's *already-distilled* summaries — compaction summaries (`session_compact`) and branch summaries (`session_tree`) — which are high-signal and low-frequency. Raw live turns (`agent_end`) get only a **lightweight deterministic nudge**, never an automatic LLM pass.
2. **Deterministic extraction heuristics are NOT used to generate candidates.** Keyword/pattern scraping of free-form text is noisy and lossy. `PRD.md §3` Principle 5 ("candidate generation is deterministic") applies to *retrieval* (filtering the graph), not to *extraction* from conversation. Determinism in Phase 2 lives in the **plumbing** — dedup, provenance stamping, the queue, and revert — not in deciding what is worth a memory.
3. **The control layer is the centerpiece, and it is mode-independent.** Every captured/suggested memory flows through: a visible pending **queue**, **provenance** on every write, and **forward bulk-revert** (mark inactive / supersede / cascade-delete — never a WAL rollback). This layer is identical in interactive and headless modes.
4. **Headless / RPC default = risk-gated auto-commit.** In a session with no UI (`ctx.hasUI === false`, e.g. orchestrator-driven RPC), *confident + safe* candidates auto-commit to the graph stamped `status: "unreviewed"`, `source: "auto"`, with full provenance; *sensitive / low-confidence* candidates are deferred to the queue. The orchestrator can audit via the RPC event/command stream and bulk-revert at will. Behavior is a setting (`headlessPolicy`).
5. **Gate-then-write, never write-then-rollback.** `akg-ts` has **no selective commit** — `commit()` flushes all pending mutations. So the capture decision happens *before* `putNode` is ever called. The `.akg` graph only ever contains memories that passed the gate. Deferred candidates live **outside** `.akg`, in a project-local sidecar queue. "Revert" of an auto-captured node is a normal forward operation (filter by `meta.status === "unreviewed"` → forget), reusing Phase 1 tooling.
6. **The LLM call is a dependency-injected function.** Extraction logic (prompt assembly, response parsing, schema validation, dedup, routing) takes an `LlmFn` parameter and is fully unit-testable with a fake. Only the thin adapter that binds `ctx.model` to a real `LlmFn` lives in (untested) extension glue, consistent with `test/testing-strategy.md`.

Exit criteria (from `PRD.md §12`): automatic capture produces useful low-noise candidates; memory stays compact and curated; and — added this phase — capture is transparent and reversible in both interactive and headless modes.

---

## Phase 2 · Epic 1 — Capture pipeline (P2-001 … P2-007)

*The extraction + capture engine. Fully unit/integration-testable with a faked `LlmFn`. Must complete before Epic 2.*

### P2-001 — Extend `src/settings.ts` with auto-capture settings

**Output:** `src/settings.ts` gains Phase 2 settings with defaults; `loadSettings` merges them.

**Spec:**
- Add to the `Settings` type and defaults:
  - `autoCaptureEnabled: boolean` (default `true`)
  - `autoCaptureSources: ("compaction" | "branch")[]` (default `["compaction", "branch"]`)
  - `headlessPolicy: "auto-commit" | "defer" | "off"` (default `"auto-commit"`)
  - `candidateQueuePath: string` (default `.pi/memory-candidates.jsonl`, relative to `cwd`)
  - `autoCommitMinConfidence: number` (default `0.7`) — candidates at/above this AND judged safe may auto-commit
  - `dropBelowConfidence: number` (default `0.3`) — candidates below this are discarded, not queued
  - `maxCandidatesPerExtraction: number` (default `10`)
  - `liveTurnNudge: boolean` (default `false`) — the `agent_end` deterministic nudge, opt-in to avoid noise
- All existing Phase 1 settings and `loadSettings(overrides?)` merge semantics are preserved.

**Acceptance criteria:**
- `npx tsc --noEmit` exits 0.
- `npm run test:unit` passes, including a new `test/unit/settings.test.ts` case asserting `loadSettings().headlessPolicy === "auto-commit"` and `loadSettings({ headlessPolicy: "defer" }).headlessPolicy === "defer"`.
- A test asserts `loadSettings().autoCaptureSources` deep-equals `["compaction", "branch"]` and `loadSettings().autoCommitMinConfidence === 0.7`.

---

### P2-002 — Implement `src/candidate-queue.ts` (sidecar pending queue)

**Depends on:** P2-001, P1-003 (provenance type)

**Output:** `src/candidate-queue.ts` manages a project-local newline-delimited JSON queue of pending memory candidates at `settings.candidateQueuePath`. This file is **not** an `.akg` file and never touches `akg-ts`.

**Spec:**
- Define and export the canonical candidate shape:
  ```ts
  interface MemoryCandidate {
    id: string;             // queue-local stable id (e.g. `${origin}-${slug}-${shortHash}`)
    type: string;           // a NODE_TYPES value
    title: string;
    body: string;
    tags?: string[];
    confidence: number;     // 0..1
    origin: "compaction" | "branch" | "turn";
    provenance: ProvenanceMetadata;
    createdAt: string;      // ISO timestamp
  }
  ```
- Export `class CandidateQueue` (or equivalent functions) with: `static open(cwd, settings)`, `append(c)`, `list(): MemoryCandidate[]`, `get(id)`, `remove(id)`, `clear()`. Reads/writes are JSONL; a missing file is treated as an empty queue (created on first append).
- Appends must be durable (flush to disk) and tolerate a corrupt/partial trailing line by skipping it rather than throwing.
- Must not create the `.pi/` directory destructively if it already exists; create it if absent.

**Acceptance criteria:**
- `npx tsc --noEmit` exits 0.
- New `test/integration/candidate-queue.test.ts` (real temp dir via the existing temp-dir helper pattern) passes: append two candidates → `list()` returns 2 in insertion order; `remove(id)` of the first → `list()` returns 1; reopening the queue from the same path returns the surviving candidate (persistence across reopen).
- A test writes a file with a valid line followed by a truncated `{"id":` line and asserts `list()` returns exactly the one valid candidate (no throw).

---

### P2-003 — Extend `src/provenance.ts` for auto-capture provenance

**Depends on:** P1-003, P1-001

**Output:** `src/provenance.ts` gains a helper that builds richer provenance for auto-captured memories.

**Spec:**
- Export `buildAutoProvenance(input: { cwd?; sessionId?; entryIds?; origin: "compaction" | "branch" | "turn"; summaryEntryId?; confidence: number }): ProvenanceMetadata`.
- The returned metadata sets `source: "auto"`, includes `origin`, `summary_entry_id` (when provided), `confidence`, and `last_seen_at` (ISO), and omits undefined fields (matching existing `buildProvenance` behavior).
- Auto-captured records carry `status: "unreviewed"` — define this as the status value written by the capture path (P2-007), not by provenance itself, but document the constant here or in `schema.ts`.

**Acceptance criteria:**
- `npx tsc --noEmit` exits 0.
- New unit test in `test/unit/provenance.test.ts` (under `vi.useFakeTimers()` per the existing convention) asserts: `buildAutoProvenance({ origin: "compaction", confidence: 0.8 }).source === "auto"`, `.origin === "compaction"`, `.confidence === 0.8`, exact `last_seen_at`, and that an omitted `sessionId` does not appear as a key.

---

### P2-004 — Implement `src/dedup.ts`

**Depends on:** P1-001, P1-004 (store), P2-002 (candidate type)

**Output:** `src/dedup.ts` decides whether a candidate is new, an update to an existing memory, or a duplicate — checked against both the graph and the queue.

**Spec:**
- Export `classifyCandidate(candidate: MemoryCandidate, store: MemoryStore, queue: MemoryCandidate[]): { action: "new" | "update" | "duplicate"; existingId?: string }`.
- `"update"`: a graph node with the same `type` and a normalized-equal `title` exists (normalization: lowercase, collapse whitespace, trim) → returns its id so the caller upserts/supersedes rather than creating a sibling.
- `"duplicate"`: an equivalent candidate already sits in the queue (same `type` + normalized `title`) → caller should skip enqueuing.
- `"new"`: no match in graph or queue.
- Pure logic over store read accessors + an in-memory queue array, so it is unit-testable with the existing `makeFakeStore` fake.

**Acceptance criteria:**
- `npx tsc --noEmit` exits 0.
- New `test/unit/dedup.test.ts` passes with `makeFakeStore`: a candidate whose title matches an existing node (different casing/whitespace) → `{ action: "update", existingId }`; a candidate matching a queue entry → `"duplicate"`; a novel candidate → `"new"`.

---

### P2-005 — Implement `src/extraction.ts` (LLM-injected extraction)

**Depends on:** P1-001, P2-001, P2-002 (candidate type), P2-003

**Output:** `src/extraction.ts` turns a distilled summary into validated candidate records using an injected LLM function.

**Spec:**
- Export `type LlmFn = (prompt: string, opts?: { signal?: AbortSignal }) => Promise<string>`.
- Export `extractCandidates(input: { summaryText: string; origin: "compaction" | "branch"; provenanceBase: {...} }, llm: LlmFn, settings: Settings): Promise<MemoryCandidate[]>`.
- Build a bounded prompt instructing the model to return STRICT JSON: an array of `{ type, title, body, tags?, confidence }`, only durable facts (decisions/constraints/preferences/tasks/artifacts/repo facts), no transcript echoes.
- Parse defensively: tolerate code-fenced JSON; on malformed JSON return `[]` (never throw). Validate each item — drop items whose `type` is not in `NODE_TYPES`, whose `title`/`body` is empty, or whose `confidence` is not a finite 0..1 number. Cap to `settings.maxCandidatesPerExtraction`.
- Attach `provenance` via `buildAutoProvenance` and a stable queue `id` to each surviving candidate.

**Acceptance criteria:**
- `npx tsc --noEmit` exits 0.
- New `test/unit/extraction.test.ts` passes with a fake `LlmFn`: a fake returning valid JSON for 3 items (one with an invalid `type`) yields exactly 2 valid candidates, each with `source: "auto"` provenance; a fake returning malformed text yields `[]`; a fake returning 50 items is capped to `maxCandidatesPerExtraction`.

---

### P2-006 — Implement `src/capture-policy.ts` (the gate)

**Depends on:** P1-005 (risk-policy), P2-001, P2-005 (candidate type)

**Output:** `src/capture-policy.ts` routes a candidate to auto-commit, defer, or drop, combining confidence, the existing risk assessment, UI availability, and `headlessPolicy`.

**Spec:**
- Export `routeCandidate(candidate: MemoryCandidate, ctx: { hasUI: boolean }, settings: Settings): { action: "auto-commit" | "defer" | "drop"; reason: string }`.
- Decision order:
  1. `confidence < settings.dropBelowConfidence` → `"drop"`.
  2. Run `assessRisk` on the candidate. If it is not a clean `"write"` (i.e. sensitive/secret-like/low-confidence/ambiguous) → `"defer"`.
  3. If clean AND `confidence >= settings.autoCommitMinConfidence`:
     - interactive (`hasUI`) → `"defer"` (a human is present to review; do not auto-write).
     - headless + `headlessPolicy === "auto-commit"` → `"auto-commit"`.
     - headless + `headlessPolicy === "defer"` → `"defer"`.
     - `headlessPolicy === "off"` → `"drop"`.
  4. Otherwise → `"defer"`.
- Pure function; no I/O.

**Acceptance criteria:**
- `npx tsc --noEmit` exits 0.
- New `test/unit/capture-policy.test.ts` covers the matrix: high-confidence clean candidate → `"defer"` interactive, `"auto-commit"` headless+auto-commit, `"defer"` headless+defer, `"drop"` headless+off; a secret-like body → `"defer"` regardless of confidence/mode; `confidence` below `dropBelowConfidence` → `"drop"`.

---

### P2-007 — Implement `src/auto-capture.ts` (orchestration)

**Depends on:** P2-002, P2-003, P2-004, P2-005, P2-006, P1-004, P1-008 (remember write path)

**Output:** `src/auto-capture.ts` runs the full pipeline for one summary and returns a deterministic outcome report.

**Spec:**
- Export `runAutoCapture(args: { store: MemoryStore; queue: CandidateQueue; summaryText: string; origin: "compaction" | "branch"; provenanceBase; llm: LlmFn; settings: Settings; hasUI: boolean; signal?: AbortSignal }): Promise<{ committed: string[]; deferred: string[]; dropped: number; duplicates: number }>`.
- Pipeline: `extractCandidates` → for each, `classifyCandidate` (skip on `"duplicate"`, counting it) → `routeCandidate`:
  - `"auto-commit"` → write to the graph reusing the Phase 1 remember write path with `status: "unreviewed"`, `source: "auto"`, and provenance; on `"update"` classification, upsert/supersede the existing id rather than duplicating.
  - `"defer"` → `queue.append(candidate)`.
  - `"drop"` → discard.
- After processing, if anything was committed, call `store.commit()` exactly once (gate-then-write; batch durability per design decision 5).
- Never throw on a single bad candidate — isolate per-candidate failures and continue.

**Acceptance criteria:**
- `npx tsc --noEmit` exits 0.
- New `test/integration/auto-capture.test.ts` (real temp store + real temp queue + fake `LlmFn`) passes:
  - headless (`hasUI:false`, default settings), fake LLM returns one high-confidence clean candidate + one secret-like candidate → report shows 1 committed, 1 deferred; the committed node exists in the graph with `meta.status === "unreviewed"` and `meta.source === "auto"`; the deferred candidate is in the queue and NOT in the graph.
  - interactive (`hasUI:true`) with the same input → 0 committed, 2 deferred (high-confidence clean is deferred for human review).
  - re-running the same extraction twice does not create a duplicate graph node (dedup `"update"`/`"duplicate"` path).

---

## Phase 2 · Epic 2 — Control surface & integration (P2-008 … P2-015)

*Review/revert surfaces, the live model adapter, Pi hook wiring + nudge, and docs. Consumes the Epic 1 modules.*

### P2-008 — Implement review surface: `memory_review` tool + `/memory-review` command

**Depends on:** P2-002, P1-008 (remember), P1-004

**Output:** `src/tools/review.ts` with shared logic, exposed as both an LLM/RPC-callable `memory_review` tool and an interactive `/memory-review` command.

**Spec:**
- Shared logic: `listPending(queue)`, `accept(queue, store, id, edits?)` (promote a candidate to a real graph node via the remember write path, set `status: "active"`, remove from queue), `reject(queue, id)` (remove from queue, no graph write).
- `memory_review` tool params: `{ action: "list" | "accept" | "reject"; id?; edits? }`. `action:"list"` returns a compact bounded summary of pending candidates (reuse `formatCandidates`-style budgeting, `settings.toolResultBudget`). Usable by the agent and by an orchestrator over RPC.
- `/memory-review` command (interactive): if `ctx.hasUI`, walk pending candidates with `ctx.ui.confirm`/`ctx.ui.select` to accept/reject/skip; otherwise `ctx.ui.notify` a message pointing at the `memory_review` tool.
- Accept/reject must be atomic per candidate (queue and graph stay consistent if one fails).

**Acceptance criteria:**
- `npx tsc --noEmit` exits 0.
- New `test/integration/review.test.ts` passes: seed the queue with 2 candidates; `accept(first)` → first becomes an `active` graph node and queue length drops to 1; `reject(second)` → queue empty and no second node in the graph; accepting with `edits` (changed title/body) writes the edited values.

---

### P2-009 — Implement bulk revert: `memory_revert` tool + `/memory-revert` command

**Depends on:** P1-006 (retrieval filters), P1-011 (forget), P1-004

**Output:** `src/tools/revert.ts` with shared logic and both tool and command surfaces, for sweeping auto-captured `unreviewed` memories.

**Spec:**
- Shared logic: `findUnreviewed(store, filter?: { origin?; sessionId?; sinceMs? })` returns auto-captured nodes where `meta.status === "unreviewed"` (optionally narrowed); `revert(store, ids, mode: "deactivate" | "delete")` applies the Phase 1 forget operation per id (default `"deactivate"`; `"delete"` uses cascade per FR6 semantics).
- `memory_revert` tool params: `{ mode?: "deactivate" | "delete"; origin?; sinceMs?; confirm? }`. With no `confirm` it returns a dry-run summary (how many would be affected, list of ids/titles); with `confirm: true` it performs the revert. This forward operation reuses Phase 1 forget — it is NOT a WAL rollback.
- `/memory-revert` command (interactive): show the dry-run via `ctx.ui`, confirm, then revert.

**Acceptance criteria:**
- `npx tsc --noEmit` exits 0.
- New `test/integration/revert.test.ts` passes: create 2 `unreviewed` auto nodes and 1 `active` reviewed node; `memory_revert` dry-run reports exactly the 2 unreviewed; `confirm:true` with default mode deactivates exactly those 2 (now absent from default recall) and leaves the active node untouched; `mode:"delete"` removes them from the graph.

---

### P2-010 — Extend status + maintenance for Phase 2 visibility

**Depends on:** P2-002, P1-007 (maintenance), P1-014 (status)

**Output:** `getMemoryStats` and `/memory-status` report queue depth, unreviewed auto-capture counts, and a compaction recommendation.

**Spec:**
- Extend `MemoryStats` with `pendingCandidates: number` (from the queue), `unreviewedNodes: number` (graph nodes with `meta.status === "unreviewed"`), and `walGrowthHint: boolean` (from `store.hasUncompactedWAL`, surfaced as a "consider compaction" recommendation).
- `/memory-status` output gains a "Pending review: N candidate(s)", "Unreviewed auto-captured: N", and (when `walGrowthHint`) a "Run maintenance compaction" line. Still bounded; still no full record dumps.

**Acceptance criteria:**
- `npx tsc --noEmit` exits 0.
- `test/unit/maintenance.test.ts` gains a case (fake store + injected queue count) asserting `getMemoryStats` returns the correct `pendingCandidates` and `unreviewedNodes`.
- `npm run test:unit` and `npm run test:integration` both pass.

---

### P2-011 — Implement `src/llm.ts` (model adapter) — SPIKED 2026-05-30

**Status:** De-risked and drafted during planning. `src/llm.ts` and `scripts/smoke-llm.ts` exist in the working tree; `npx tsc --noEmit` passes against pi-ai 0.78.0 and the smoke runs (`skipped: no model` with no key). The validated API path is recorded below. Remaining for this task: reconcile the `LlmFn` type location with P2-005 and add the testing-strategy note (folded into P2-015); the live network round-trip is validated in P2-012.

**Output:** `src/llm.ts` exports a factory that adapts a Pi `ctx.model` into the `LlmFn` used by extraction. This is the only Phase 2 module that touches the real model API.

**Validated API path (confirmed against installed 0.78.0):**
- `import { completeSimple } from "@earendil-works/pi-ai"` — `completeSimple(model, context, options?) => Promise<AssistantMessage>` is the one-shot, non-streaming primitive.
- `Context = { systemPrompt?, messages: Message[], tools? }`; a user turn is `{ role: "user", content: string, timestamp: number }`.
- `AssistantMessage.content` is `(TextContent | ThinkingContent | ToolCall)[]`; extract text by filtering `c.type === "text"` and joining `c.text`. Check `stopReason` (`"error"`/`"aborted"` → throw).
- Options (`SimpleStreamOptions`): `apiKey`, `headers`, `maxTokens`, `temperature`, `signal`, `reasoning?`.
- Auth: `ctx.modelRegistry.getApiKeyAndHeaders(model) => Promise<{ ok:true; apiKey?; headers? } | { ok:false; error }>`. Standalone fallback for scripts/tests: `getEnvApiKey(provider)` + `getModels(provider)` / `getModel(provider, id)` from pi-ai.

**Spec:**
- Export `makeLlmFn(model, registry, options?): LlmFn` performing a single-shot, bounded, non-streaming completion, returning the assistant text.
- If no model is available or auth cannot be resolved, the returned `LlmFn` rejects with a clear, catchable error (callers in P2-012 treat extraction as a no-op on failure — auto-capture must never crash a session).
- Note: the spike defines `LlmFn` locally in `llm.ts`; P2-005 should own the canonical `LlmFn` type (or a shared `src/types.ts`) and `llm.ts` import it, so `extraction.ts` does not depend on the model adapter.

**Acceptance criteria:**
- `npx tsc --noEmit` exits 0. ✅ (passing as of the spike)
- A guarded `npx tsx scripts/smoke-llm.ts` exists: with a provider key present it performs one tiny completion and prints non-empty text + `PASS`; with no key it prints `"skipped: no model"` and exits 0. ✅ (no-key path verified; keyed path pending a key / P2-012)
- No network assertion in the Vitest suite — this is glue, per `test/testing-strategy.md`.

---

### P2-012 — Wire Phase 2 into `extensions/akg-memory.ts`

**Depends on:** P2-007, P2-008, P2-009, P2-010, P2-011, P1-015

**Output:** The extension opens the candidate queue, runs auto-capture on the summary hooks, applies the deterministic live-turn nudge, registers the new tools/commands, and documents validation.

**Spec:**
- On `session_start`: open the `CandidateQueue` alongside the store; build `LlmFn` via `makeLlmFn(ctx.model, ctx.modelRegistry)`.
- On `session_compact` (if `autoCaptureEnabled` and `"compaction"` in `autoCaptureSources`): extract the compaction summary text from `event.compactionEntry`, call `runAutoCapture({ origin: "compaction", hasUI: ctx.hasUI, ... })`. Wrap in try/catch — log to stderr on failure, never crash the session.
- On `session_tree` (if enabled and `"branch"` in sources): same, using `event.summaryEntry`, `origin: "branch"`.
- On `agent_end`: if `settings.liveTurnNudge` and `ctx.hasUI`, emit at most one bounded `ctx.ui.notify` per session suggesting `/memory-review` when pending candidates exist. No LLM pass here.
- Register `memory_review` and `memory_revert` tools and `/memory-review`, `/memory-revert` commands.
- On `session_shutdown`: commit/close store and flush the queue (existing behavior preserved).
- Add `docs/phase2-validation.md` with headings `## Hooks Fired`, `## Auto-Capture (headless)`, `## Review Flow`, `## Revert Flow`, recording an RPC-driven smoke run (compaction → unreviewed node; `/memory-review`; `/memory-revert`) and the `pi --version`.

**Acceptance criteria:**
- `npx tsc --noEmit` exits 0 for the whole project.
- Loading the package with `pi -e ./` registers `memory_review` and `memory_revert` (verify via the in-session tool list / `getCommands`, since `--list-tools` does not exist in this Pi version).
- A documented RPC smoke run in `docs/phase2-validation.md` shows: a forced `compact()` over RPC in a headless session produces an `unreviewed` `source:auto` node (or, with `headlessPolicy: "defer"`, a queue entry) — captured in the doc with the observed output.
- Inducing an extraction failure (e.g. no model) leaves the session running and writes nothing to the graph.

---

### P2-013 — Update `skills/akg-memory/SKILL.md` for auto-capture

**Depends on:** P2-012

**Output:** The skill teaches the auto-capture model and the review/revert workflow.

**Spec:**
- Add sections covering: what auto-capture does (summaries only, not raw turns); what `status: "unreviewed"` / `source: "auto"` mean; how to use `memory_review` to accept/reject pending candidates; how to use `memory_revert` (dry-run first) to undo auto-captures; and that interactive sessions defer everything for human review while headless sessions may auto-commit confident candidates.
- Reinforce the existing anti-noise guidance.

**Acceptance criteria:**
- `grep -c "memory_review\|memory_revert\|unreviewed\|auto-capture" skills/akg-memory/SKILL.md` returns 4 or more.
- `pi -e ./` still discovers the `akg-memory` skill (loads without manifest error).
- `wc -w skills/akg-memory/SKILL.md` is between 500 and 2500 words.

---

### P2-014 — Update prompt templates

**Depends on:** P2-008, P2-009

**Output:** `prompts/memory-review.md` reflects the real queue + `memory_review` tool; add `prompts/memory-revert.md`; refresh `prompts/memory-cleanup.md`.

**Spec:**
- `memory-review.md`: instruct the model to call `memory_review` with `action:"list"`, then accept/reject/edit each pending candidate with the user's confirmation.
- `memory-revert.md`: instruct the model to run `memory_revert` as a dry-run, summarize what would be undone, and only revert on user confirmation.
- `memory-cleanup.md`: add the unreviewed-auto-capture sweep to the existing duplicate/superseded curation guidance.

**Acceptance criteria:**
- `ls prompts/memory-review.md prompts/memory-revert.md prompts/memory-cleanup.md` exits 0.
- `pi -e ./` discovers all prompt resources without error.
- Each of the three files references at least one `memory_*` tool by name.

---

### P2-015 — Update `README.md` and `test/testing-strategy.md`

**Depends on:** P2-012, P2-013, P2-014

**Output:** Documentation reflects Phase 2.

**Spec — README additions:**
- An "Automatic capture (Phase 2)" section: hybrid extraction from compaction/branch summaries, the unreviewed→review→active lifecycle, and the headless `auto-commit` default.
- Document the `.pi/memory-candidates.jsonl` sidecar and recommend gitignoring it alongside `.pi/memory.akg` (still no auto-editing of `.gitignore`).
- List the new `memory_review` / `memory_revert` tools and `/memory-review` / `/memory-revert` commands.
- Document the new settings from P2-001 with defaults.

**Spec — testing-strategy additions:**
- Document the injected-`LlmFn` fake pattern for extraction unit tests, and that `src/llm.ts` + the extension glue remain the intentional untested gap.

**Acceptance criteria:**
- `grep -c "memory_review\|memory_revert\|memory-candidates.jsonl\|auto-commit" README.md` returns 4 or more.
- `grep "LlmFn" test/testing-strategy.md` returns a non-empty line.
- `npm test` (full suite) passes.

---

## Open Questions

None blocking. All Phase 0/1 product decisions are resolved per `PRD.md §14`; Phase 2 design decisions are resolved in the "Resolved Phase 2 design decisions" block above (planning session 2026-05-30). Deferred to Phase 3 by design: ranking over retrieved candidates, merge/consolidation across memory files, named memory stores/scopes, and an orchestrator-mediated review contract richer than the `memory_review` tool surface.

---

## Task Dependency Summary

```
P0-001
  └── P0-002
        └── P0-003
              └── P0-004
P0-001 ──────────── P0-005
                      └── P0-006
                            │
             [Phase 1 begins after all P0 tasks]
                            │
P1-001 (schema)
P1-002 (settings)
P1-003 (provenance)
P1-004 (memory-store) ← P0-005, P0-006, P1-001, P1-002
P1-005 (risk-policy) ← P1-001
P1-006 (retrieval) ← P1-001, P1-004
P1-007 (maintenance) ← P1-001, P1-004
P1-008 (remember) ← P1-003, P1-004, P1-005
P1-009 (recall) ← P1-006
P1-010 (link) ← P1-004
P1-011 (forget) ← P1-004
P1-012 (recent) ← P1-006
P1-013 (inspect) ← P1-006
P1-014 (status cmd) ← P1-007, P0-002
P1-015 (extension wiring) ← P1-004, P1-008..P1-014
P1-016 (SKILL.md) ← P1-015
P1-017 (prompts) [independent, can run in parallel with P1-015]
P1-018 (README) ← P1-015, P1-016, P1-017

             [Phase 2 begins after all P1 tasks]
                            │
── Epic 1: Capture pipeline ──
P2-001 (settings+)
P2-002 (candidate-queue) ← P2-001, P1-003
P2-003 (provenance+) ← P1-003, P1-001
P2-004 (dedup) ← P1-001, P1-004, P2-002
P2-005 (extraction) ← P1-001, P2-001, P2-002, P2-003
P2-006 (capture-policy) ← P1-005, P2-001, P2-005
P2-007 (auto-capture) ← P2-002, P2-003, P2-004, P2-005, P2-006, P1-004, P1-008
── Epic 2: Control surface & integration ──  [starts after Epic 1 complete]
P2-008 (review tool+cmd) ← P2-002, P1-008, P1-004
P2-009 (revert tool+cmd) ← P1-006, P1-011, P1-004
P2-010 (status+maint) ← P2-002, P1-007, P1-014
P2-011 (llm adapter) [independent]
P2-012 (extension wiring) ← P2-007, P2-008, P2-009, P2-010, P2-011, P1-015
P2-013 (SKILL.md) ← P2-012
P2-014 (prompts) ← P2-008, P2-009
P2-015 (README + testing-strategy) ← P2-012, P2-013, P2-014
```
