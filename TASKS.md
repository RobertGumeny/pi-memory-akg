# TASKS: pi-memory-akg Implementation

Source: `PRD.md` (Status: Implementation-ready, 2026-05-28)  
Phases in scope: Phase 0 (baseline validation) and Phase 1 (explicit memory tools).  
Phase 2 and Phase 3 are documented in `PRD.md §12` but not broken down here.

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

## Open Questions

None — all product decisions are resolved per `PRD.md §14`. Implementation questions surfaced during P0-005 (single-writer behavior) are resolved in P0-006.

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
```
