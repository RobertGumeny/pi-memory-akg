# PRD: AKG Durable Memory Pi Package

Status: Phase 0–2 implemented and validated (on `akg-ts@0.1.3`); Phase 3 roadmap drafted into tasks in `TASKS.md`  
Source brief: `report-akg_pi_memory_recommendations.md`  
AKG gap reconciliation: archived (see `docs/akg-gap-inventory.md` in git history through commit `ba7d92b`)  
Last updated: 2026-06-02

## 1. Problem

Pi already preserves exact conversational history in branch-aware JSONL session files, but useful working knowledge is trapped inside those sessions. When an operator resumes work days later, starts a new session, or switches branches, the agent must rediscover durable facts from transcripts, compaction summaries, repo files, or user repetition.

Today this creates several failure modes:

- User preferences such as “prefer project-local package installs” or “do not use vector search for this memory system” must be restated across sessions.
- Project constraints and architectural decisions are buried in old conversations or reports.
- Active tasks, known artifacts, and important files are not available as a compact reusable memory set.
- Naively solving this by mirroring every Pi message into AKG would duplicate Pi’s session store, bloat memory, and make retrieval noisy.

Pi needs selective durable semantic memory that complements, rather than replaces, session JSONL history.

## 2. Goal

Build a distributable Pi package that uses AKG as selective, provenance-aware durable semantic memory for Pi projects, starting with explicit memory tools, a tiny memory-availability/index hint, and agent-directed recall.

## 3. Product Principles

1. **Pi sessions remain the source of truth for exact history.** Do not replace or mirror Pi JSONL session files.
2. **AKG stores reusable knowledge, not transcripts.** Store decisions, constraints, preferences, tasks, artifacts, repo facts, and relationships.
3. **Memory is selective, deduplicated, and update-oriented.** Prefer updating/superseding existing records over creating duplicates.
4. **Retrieval is agent-directed.** Give the agent enough index/status information to know memory exists, then let it decide when and how to query memory for the task at hand.
5. **Candidate generation is deterministic; relevance judgment is not.** Tools should provide predictable filters, graph traversal, tags, recency, metadata, and provenance, but the agent/model decides which candidates are actually relevant.
6. **Provenance is required.** Durable memories should preserve source context where possible: cwd, session id, entry ids, source category, confidence, and timestamps.
7. **The model gets compact affordances, not raw graph dumps.** Inject at most a tiny memory-availability/index hint by default; full memory content should be retrieved through explicit tools.
8. **The tool surface is narrow.** Do not expose arbitrary graph mutation primitives to the model.

## 4. Target Users

- Pi users who work on long-lived repositories across many sessions.
- Agents operating inside Pi that need durable project continuity without full transcript replay.
- Package authors/operators who want an inspectable local memory file instead of opaque vector memory.

## 5. Target UX

### 5.1 Install / enable package

```bash
pi install git:github.com/rgumeny/pi-memory-akg
# or during development
pi -e ./packages/pi-memory-akg
```

Package resources:

```text
extensions/akg-memory.ts
skills/akg-memory/SKILL.md
prompts/memory-review.md      # optional
prompts/memory-cleanup.md     # optional
prompts/memory-status.md      # lightweight Phase 1 status UX
```

The package creates or opens a per-project AKG memory file:

```text
.pi/memory.akg
```

The package must not modify `.gitignore` automatically. Documentation and status output should recommend ignoring `.pi/memory.akg` for private/local memory unless a project intentionally wants to share curated memory in git. Future versions may support multiple named memory stores with different sharing policies, but Phase 1 uses one default project-local file.

### 5.2 Explicit remembering

When a durable fact appears, the agent can call a narrow memory tool:

```text
memory_remember({
  type: "decision",
  title: "AKG is durable semantic memory, not Pi session storage",
  body: "Pi JSONL sessions remain the source of truth for exact conversation history. AKG stores selective reusable knowledge.",
  tags: ["durable", "design"],
  provenance: { source: "manual", cwd: "/repo", session_id: "...", entry_ids: ["..."] }
})
```

Expected user-visible tool result:

```text
Remembered decision: AKG is durable semantic memory, not Pi session storage
ref: decision/akg-durable-memory-not-session-storage
```

### 5.3 Recall / inspect memory

```text
memory_recall({ types: ["constraint", "decision"], tags: ["design"], limit: 8 })
```

Expected result to the model:

```text
Relevant memory:
1. [decision] AKG is durable semantic memory, not Pi session storage
2. [constraint] Do not store every Pi message in AKG
3. [constraint] Use agent-directed recall rather than automatic hidden memory selection
```

### 5.4 Tiny memory index/status hint

Before an agent turn, the extension should inject only a tiny hidden affordance that tells the agent memory exists and how to query it. The hint is enabled by default to support the Phase 1 knowledge-base pattern, controlled by a package setting so projects can disable it, and should not choose or inject full memory records by default.

Example default hint:

```markdown
<akg-memory-status>
Project AKG memory is available at .pi/memory.akg. Use memory_recall, memory_recent, or memory_inspect when durable project context may affect this task.
</akg-memory-status>
```

If the package later supports richer automatic memory injection, that should be opt-in and separately configurable. Phase 1 should follow the existing knowledge-base pattern: expose an index/affordance and let the agent figure out its own context.

Default budget: the hidden hint should be capped at 400 characters. Retrieval and maintenance tool results should default to a 6,000 character cap per tool call, with compact per-record summaries and caller-configurable lower limits. `memory_inspect` may use the same default cap but should require explicit IDs and truncate long bodies/edge lists deterministically.

### 5.5 Maintenance commands / prompts

Optional slash prompts support explicit review and status workflows:

```text
/memory-status
/memory-review
/memory-cleanup
```

`/memory-status` should be a lightweight operator-facing status prompt, backed by deterministic package status data. It should report whether memory is enabled, the memory file path, hint state/budget, tool-result budget, approximate counts by type/status, recent memory titles, gitignore recommendation, available tools, and suggested next actions. It should not dump full memory records.

Example outcome:

```text
Memory review found 3 duplicate task memories and 1 superseded constraint. Proposed updates:
- Supersede task/old-sdk-scan with task/akg-ts-prereqs
- Merge duplicate decisions about edge strength default
```

## 6. In Scope

### 6.1 Package structure

- A Pi package installable through Pi package mechanisms.
- `package.json` with `pi-package` keyword and `pi` manifest or conventional directories.
- Runtime dependency on `akg-ts`.
- Peer dependencies for Pi packages imported by extensions, using `"*"` ranges where applicable.

### 6.2 Extension: `extensions/akg-memory.ts`

The extension owns runtime memory behavior:

- Open/manage `.pi/memory.akg` for the current working directory.
- Initialize memory schema conventions if needed.
- Register narrow memory tools:
  - `memory_remember`
  - `memory_recall`
  - `memory_link`
  - `memory_forget`
  - `memory_recent`
  - `memory_inspect`
- Expose a tiny memory availability/index hint before or around agent turns.
- Provide agent-directed retrieval tools so the model can decide what memory is relevant.
- Commit reliably during normal operation and on `session_shutdown`.
- Expose maintenance/debug status without overwhelming context.
- Avoid arbitrary raw graph mutation tools.

### 6.3 Skill: `skills/akg-memory/SKILL.md`

The skill teaches the model:

- What qualifies as durable memory.
- What must not be stored.
- When to update, supersede, link, or forget existing memory.
- How to preserve provenance and uncertainty.
- How to use each memory tool safely.
- How to keep memory compact and inspectable.

### 6.4 Optional prompt templates

Prompt templates may support:

- Memory review after a session.
- Memory cleanup/curation.
- Project bootstrap/import.
- “What should I remember from this session?” workflows.

### 6.5 Memory schema conventions

Initial node types:

- `project`
- `session`
- `decision`
- `constraint`
- `preference`
- `task`
- `artifact`
- `file`
- `concept`
- `pattern`

Initial relation types:

- `affects`
- `depends_on`
- `blocks`
- `implements`
- `documents`
- `derived_from`
- `supersedes`
- `relevant_to`

Initial tags:

- `durable`
- `active`
- `user_pref`
- `repo_fact`
- `workflow`
- `bug`
- `design`

Metadata fields:

- `cwd`
- `session_id`
- `entry_ids`
- `source`
- `status`
- `confidence_reason`
- `last_seen_at`

### 6.6 Retrieval strategy

Phase 1 retrieval should follow the knowledge-base pattern: expose enough index/status information for the agent to know memory exists, then provide tools for exploratory, task-directed retrieval.

The retrieval tools must support:

1. Candidate generation by type, tag, ids, graph neighbors, recency, metadata, active status, and current project/session provenance.
2. Compact formatting of candidate memories.
3. Strict size budgets for tool results and any injected status/index hint.
4. Agent/model judgment over candidate relevance, including follow-up `memory_inspect` calls for records that look important.

The current `akg-ts` SDK does not provide full-text or lexical search over record title/body content. Phase 1 retrieval must therefore avoid promising search semantics it cannot support. If desired later, lexical search should be added as an SDK feature or implemented as an explicitly bounded extension-level scan for small graphs.

Deterministic filters are useful for repeatable candidate generation and maintenance, but Phase 1 must not pretend the extension can know exactly which records or files are relevant without agent-directed exploration.

### 6.7 Storage and provenance

- Store memory in `.pi/memory.akg` by default.
- Do not auto-edit `.gitignore`; leave sharing/ignoring policy to each project, while recommending gitignore-by-default for private/local memory and intentional opt-in for shared curated memory.
- Preserve provenance from Pi session context when available.
- Store enough metadata for review, repair, forgetting, and consolidation.
- Respect Pi session branching semantics: AKG memory is durable project memory, while session JSONL remains exact branch history.

## 7. Out of Scope / Non-goals

- Replacing Pi session JSONL files.
- Storing every user/assistant/tool message in AKG.
- Creating a transcript archive in AKG.
- Using embeddings or vector search as the core retrieval mechanism.
- Exposing unconstrained graph editing tools to the model.
- Phase 1 automatic extraction from every completed turn.
- Phase 1 merge/consolidation across multiple memory files.
- Building an AKG GUI or full graph browser.
- Modifying Pi core session storage.

## 8. Hard Constraints

- The package must respect Pi’s extension lifecycle, including `session_start`, turn/context hooks, and `session_shutdown`.
- Default hidden context must be limited to a tiny memory availability/index hint; raw graph dumps and auto-selected memory dumps are forbidden by default.
- Tool outputs must be truncated/bounded according to Pi extension best practices.
- Custom tools must use schemas compatible with Pi providers; string enums should use Pi-compatible enum helpers where needed.
- The package must follow `akg-ts` single-writer semantics: one active writer per `.pi/memory.akg` file. The SDK documents this rule but does not provide lock-file or advisory locking.
- Within one Pi process, all `.pi/memory.akg` mutations must be serialized through one store instance or an internal write queue.
- The package must be usable in non-interactive modes; UI prompts are optional and must check UI availability.

## 9. AKG SDK Baseline

The inspected `akg-ts` SDK already provides the core APIs needed for Phase 1:

1. Public `compact()` API.
2. Recency helpers: `recentNodes()` and `recentEdges()`.
3. Filtering/inspection helpers: `listNodesFiltered()`, `getNodes()`, `listEdges()`, `snapshot()`, inbound/outbound edge traversal.
4. Edge `strength` defaults to the AKG v1 spec value of `0.5`.
5. Documented single-writer semantics: one active writer per `.akg` file, with no built-in lock file or advisory lock.
6. Explicit delete behavior: `deleteNode()` rejects nodes with live edges; `deleteNodeCascade()` is available for intentional cascade deletion.

Important SDK limitations for this package:

- No SDK-native lexical/full-text search over node titles or bodies.
- No built-in cross-process locking.
- No merge helper requirement for Phase 1; merge remains a later enhancement.

## 10. Functional Requirements

### FR1: Package discovery and installation

- The repository provides a valid Pi package structure.
- Pi can load the extension, skill, and optional prompts from package installation or local `-e` usage.

Acceptance criteria:

- `pi install ./path-to-package` loads package resources without manifest errors.
- `pi list` shows the package after installation.
- Package resources can also be filtered through Pi package settings.

### FR2: Memory file lifecycle

- On session start, the extension opens or creates `.pi/memory.akg` for `ctx.cwd`.
- On shutdown/reload/session switch, the extension commits and closes cleanly.
- If the memory file cannot be opened, the package surfaces a clear error and disables memory tools rather than corrupting state.

Acceptance criteria:

- Starting Pi in a project creates `.pi/memory.akg` when memory is first used.
- Exiting Pi after memory writes leaves a readable AKG file.
- Reload/session switch does not lose committed memories.

### FR3: Explicit remember

- `memory_remember` creates or updates durable memory records.
- It requires type/title/body or equivalent structured fields.
- It uses risk-based confirmation rather than blanket confirmation. Normal project memories can be written without interruption; sensitive, secret-like, low-confidence/inferred, or ambiguous memories should ask first when interactive UI is available and otherwise fail with clear guidance.
- It supports tags and provenance metadata.
- It detects duplicates by stable identity, tags, metadata, or explicit caller-provided references; it must not claim full-text duplicate detection unless a later search/index feature exists.

Acceptance criteria:

- Calling `memory_remember` with a new normal project decision creates one decision node without requiring a confirmation prompt.
- Calling it again with the same stable identity updates or reports the existing record rather than creating an unlinked duplicate.
- The created record includes `cwd`, `source`, `last_seen_at`, and any available session provenance.
- A remember request that appears secret-like, sensitive, low-confidence/inferred, or ambiguous is not silently written; it either obtains user confirmation in interactive mode or returns an actionable refusal in non-interactive mode.

### FR4: Recall

- `memory_recall` returns a compact, bounded candidate set for the agent to judge.
- It supports filters for types, tags, ids, metadata, recency, graph neighborhood, active status, and limit.
- It does not promise full-text search over titles/bodies in Phase 1.
- It returns enough metadata for the agent to decide whether to inspect deeper.

Acceptance criteria:

- A recall by type `decision` returns decision records only.
- A recall with `limit: 5` returns no more than five top-level records.
- Results include IDs, titles, types, tags, and brief summaries.
- The default 6,000 character tool-result budget is enforced unless a lower caller limit is supplied.

### FR5: Link

- `memory_link` creates typed relationships between existing records.
- It supports relation type and optional strength/metadata.
- It does not create ambiguous dangling references silently.

Acceptance criteria:

- Linking `decision/a` to `constraint/b` with `affects` creates an inspectable edge.
- Linking to a missing ID returns an error result and makes no partial mutation.

### FR6: Forget / supersede

- `memory_forget` marks records inactive or superseded by default.
- It supports safe forgetting by node ref.
- It should prefer superseding when historical provenance remains useful.
- Hard deletion is explicit, requires confirmation when interactive UI is available, and must handle live edges according to SDK semantics, either by deleting edges first or using `deleteNodeCascade()` when the caller asks for cascade behavior.

Acceptance criteria:

- Forgetting an existing active task makes it absent from normal recall.
- Inspecting forgotten/superseded records shows status/provenance when retained.

### FR7: Recent and inspect

- `memory_recent` returns recently created/updated records by type/tag/status.
- `memory_inspect` returns deterministic record details and relationships by ID.

Acceptance criteria:

- `memory_recent({ limit: 10 })` returns records ordered by update time.
- `memory_inspect({ id })` returns node data, metadata, and related edges.

### FR8: Memory availability/index hint

- Before relevant agent turns, the extension injects a tiny hidden status/index hint by default.
- The hint can be disabled or adjusted through a package setting.
- The hint tells the agent that AKG memory exists and names the retrieval tools to use.
- The hint must not include auto-selected full memory records by default.

Acceptance criteria:

- With memory enabled, a new turn can receive a bounded hidden hint such as: `Project AKG memory is available; use memory_recall/memory_recent/memory_inspect when durable context may matter.`
- The default hint omits raw graph data and full memory record content.
- The default 400 character hint budget is enforced.

### FR9: Skill guidance

- The package includes an `akg-memory` skill with policy guidance.
- The skill discourages transcript mirroring and low-signal memories.
- The skill defines when each memory tool should be used.

Acceptance criteria:

- Pi discovers the skill as `/skill:akg-memory` when skill commands are enabled.
- The skill description is specific enough for on-demand loading.
- The skill contains positive and negative examples of memory candidates.

### FR10: Maintenance

- The extension exposes at least basic memory maintenance capabilities.
- Manual compaction of the AKG file is supported when `akg-ts compact()` is available.
- Optional prompts guide review and cleanup workflows.

Acceptance criteria:

- `/memory-status` or an equivalent package status surface can report enabled state, memory file path, gitignore recommendation, configured hint state/budgets, approximate counts by type/status, recent memory titles, available tools, and suggested next actions.
- A maintenance command/tool can report memory file status and recent counts.
- A compact operation can be triggered explicitly through `store.compact()`.
- Cleanup workflows can identify duplicate/superseded records without modifying them unless the agent explicitly calls memory tools.

## 11. Non-functional Requirements

### Reliability

- Memory writes must be committed durably.
- Shutdown/reload/session replacement must not leave the file in an inconsistent state.
- Tool failures must be reported as failed tool results by throwing or returning clear error content according to Pi conventions.

### Performance

- Startup should not scan the entire graph unnecessarily.
- Recall should use SDK filters/indexes where available.
- Memory status/index hint generation should be fast enough not to noticeably delay every turn.
- Retrieval tools should be fast enough for iterative agent-directed exploration on small/medium memory files.

### Safety

- No automatic storage of secrets unless explicitly requested by the user.
- Prefer storing secret references or handling instructions over raw secret values; AKG memory is not a password manager in Phase 1.
- Do not record low-confidence facts without confidence metadata.
- Do not silently store every message or raw tool output.
- Normal explicit memory writes rely on risk-based tool policy rather than blanket confirmation. The package should ask before storing sensitive, secret-like, low-confidence/inferred, or ambiguous facts when interactive UI is available, fail with guidance when confirmation is unavailable, and support a stricter ask-before-every-write setting.

### Inspectability

- Memories must be inspectable through deterministic tools.
- IDs, types, tags, relationships, status, and provenance should be visible.

### Portability

- `.pi/memory.akg` should be project-local and portable with the repo when intentionally shared.
- The package should treat git sharing as an explicit project policy, not an automatic default.
- The package should not depend on external hosted services for Phase 1.

## 12. Roadmap

### Phase 0: SDK and Pi package baseline validation

Outcome: confirm the package can be loaded as a real Pi package and is built against the current `akg-ts` public API, with any package-level workarounds explicitly documented.

Scope:

- Create the initial repository/package skeleton for `rgumeny/pi-memory-akg`.
- Add a valid `package.json` with the `pi-package` keyword and a `pi` manifest for extensions, skills, and prompts.
- Validate local package loading with `pi -e ./` from the repository root.
- Validate package install shape for future git usage with `pi install git:github.com/rgumeny/pi-memory-akg`.
- Confirm Pi discovers the extension, `akg-memory` skill, and prompt/command resources.
- Confirm the extension can register a no-op memory tool and `/memory-status` command.
- Confirm required Pi lifecycle hooks fire for this use case: `session_start`, `before_agent_start`, tool execution, and `session_shutdown`.
- Validate that `akg-ts` imports successfully as a runtime dependency from the package.
- Validate `compact()`, recency helpers, filtering/inspection helpers, edge defaults, delete behavior, and single-writer semantics against the installed SDK.
- Decide whether Phase 1 needs package-level write serialization or lock-file protection around `.pi/memory.akg`.
- Document that full-text lexical search is unavailable in the SDK and is not part of Phase 1 retrieval.

Exit criteria:

- Repo can be loaded locally with `pi -e ./`.
- Package manifest exposes the extension, skill, and prompt resources without discovery errors.
- Extension can register and execute a placeholder memory tool.
- `/memory-status` can render placeholder deterministic status.
- `akg-ts` resolves from package dependencies.
- Package implementation can perform lifecycle, retrieval, inspection, and maintenance through public SDK APIs without relying on non-public internals.

### Phase 1: explicit memory tools and agent-directed retrieval

Outcome: Users and agents can deliberately store, recall, inspect, link, and maintain durable project memory using a knowledge-base-style index and retrieval workflow.

Scope:

- Complete package metadata and harden the Phase 0 skeleton for normal local use.
- AKG-backed memory file lifecycle.
- Six explicit memory tools.
- Skill with selective-memory policy.
- Candidate-generation retrieval by type, tag, metadata, recency, provenance, and graph neighborhood.
- Tiny hidden memory availability/index hint, enabled by default and package-setting controlled.
- Lightweight `/memory-status` extension command, with optional prompt/template support for model-assisted status interpretation.
- Manual inspection and maintenance basics.

Exit criteria:

- Memory survives across Pi sessions.
- Recall improves continuity without transcript mirroring.
- Package is usable locally as a Pi package.

### Phase 2: selective automatic extraction

Outcome: The system can suggest or capture durable memories from completed work while remaining low-noise.

Scope:

- Candidate extraction from completed turns.
- Harvest from Pi compaction summaries.
- Harvest from branch summaries.
- Deduplicate/update/link existing records.
- Stronger provenance tracking.
- Optional review-before-write workflows.

Exit criteria:

- Automatic capture produces useful low-noise candidates.
- Memory stays compact and curated.

**Resolved approach (2026-05-30) — see §14 Phase 2 decisions and `TASKS.md` P2-001..015:**

- Extraction is **hybrid**: a bounded LLM pass runs only on Pi's already-distilled summaries (`session_compact`, `session_tree`); raw turns (`agent_end`) get a lightweight deterministic nudge, not an automatic LLM pass.
- Candidates flow through a mode-independent control layer — a sidecar pending **queue** (`.pi/memory-candidates.jsonl`, outside the `.akg` file), **provenance** on every write, and **forward bulk-revert** — which is where transparency and user/operator control live.
- **Headless / RPC sessions** default to **risk-gated auto-commit** (confident + safe candidates write as `status: unreviewed`, `source: auto`; sensitive/low-confidence defer to the queue). Interactive sessions defer everything for human review. Governed by a `headlessPolicy` setting.
- Because `akg-ts` has no selective commit, capture is **gate-then-write**: the `.akg` graph only ever contains memories that passed the gate, and "revert" is a forward forget operation, not a WAL rollback.

**Delivery — Phase 2 ships as two sequential epics** (task IDs in `TASKS.md`):

- **Epic 1 — Capture pipeline (P2-001 … P2-007).** Settings, the sidecar candidate queue, auto-capture provenance, dedup, the LLM extraction pass, the capture-policy gate, and the auto-capture orchestration. This is the *engine* that turns a distilled summary into committed/deferred candidates. It is fully unit- and integration-testable with a **faked `LlmFn`** — no live model or Pi wiring is needed to land and verify it.
- **Epic 2 — Control surface & integration (P2-008 … P2-015).** The review and revert tools/commands, the status/maintenance extensions, the live model adapter (`src/llm.ts`), the extension hook wiring plus the live-turn nudge, and the skill/prompts/README/testing-strategy updates. This is the user/operator-facing *control layer* plus everything that wires the engine into a running Pi session and documents it.

Epic 1 must complete before Epic 2 (Epic 2's surfaces and wiring consume the Epic 1 modules). The live model adapter and Pi-runtime validation live in Epic 2 by design, so the engine can be proven in isolation first.

### Phase 3: richer retrieval and long-term maintenance

Outcome: Memory remains useful, fast, and maintainable as the graph grows, and can be combined across files without losing provenance.

Scope:

- Improved ranking over retrieved candidate sets (recency, edge strength/confidence, tag/type relevance).
- Better graph-neighborhood and recency-aware retrieval, including multi-hop traversal.
- Pruning, superseding, and consolidation workflows within a single store.
- Cross-file merge/consolidation for imported or synced memory files.
- Future named memory stores/scopes, such as shared project memory, private local memory, environment-specific memory, and sensitive metadata memory. Phase 1 avoided implementation choices that prevent later named-store support, but AKG must not be treated as a raw secret vault without explicit encryption and policy work.

**Reconciliation with the AKG gap inventory (2026-06-02).** Phase 3 is the first phase whose design is materially shaped by where AKG itself sits. The reconciliation was captured in a gap inventory (now archived — see `docs/akg-gap-inventory.md` in git history through commit `ba7d92b`), which changed the framing of several Phase 3 items:

- **AKG write-path conformance shipped in `akg-ts@0.1.3` and is now consumed by this project.** Crash-atomic writes (GAP-1) and incremental append-only `commit()` + the auto-flush valve (write-side of GAP-4) are live in the SDK we run. Remaining adoption work is no longer a release dependency: verify crash-atomicity, and switch the `/memory-status` compaction hint from `nextWALSequence` to the precise accessors (`uncompactedWALEntryCount`/`uncompactedWALByteCount`). A periodic `compact()` cadence becomes worthwhile because uncompacted WAL is now replayed on every open.
- **Cross-file merge is spec-unblocked but SDK-unbuilt.** AKG `docs/spec/08-merge.md` resolved merge *at spec altitude* with a **conflict-preservation contract** (identity = `n:{type}:{id}` / `(from,relation,to)`; any differing logical field — including `version`/timestamps — is a conflict an implementer MUST NOT silently discard). Neither SDK implements it yet, and it is not in AKG's current "Pile 1." So pi-memory's Phase 3 merge work would be **app-level against the contract**: choose and document our own resolution policy, stage nodes-before-edges, and preserve source provenance via a `meta` key we own (the public API still cannot carry source `created_at`/`updated_at`/`version`). It needs no AKG release — but per the dogfooding-first decision it is **deferred until real multi-file demand appears.** Single-user local use never invokes merge; a committed `.akg` is already shareable as-is (one binary file), and merge is what would later resolve a *binary git conflict* between two writers — so the merge engine, if built, doubles as a git merge driver for `.akg`. We will not build it speculatively.
- **Read-side scaling stays an extension concern.** AKG reads remain O(scan) with no runtime index, and `strength`/`confidence` are stored but never range-validated or used for ranking. Phase 3 ranking and multi-hop retrieval therefore use the **scan-once, rank/traverse-in-memory** pattern (one snapshot/adjacency map per query), and **clamp/validate `strength`/`confidence` to `[0,1]` app-side** before ranking on them (GAP-5).
- **Concurrency remains app-level.** AKG still has no locking and a same-length concurrent commit silently loses updates (GAP-3). If multi-process access to one `.pi/memory.akg` ever becomes real, Phase 3 adds an app-level advisory lockfile; until then the existing one-store-per-session convention holds.
- **Sensitive named stores remain an app-level encryption concern**, and the now-landed crash-atomic writer leaves a transient plaintext temp file per commit — so a strict "never plaintext on disk" posture for a sensitive store must bypass the SDK's file I/O entirely (manage serialization/encryption around `Store.fromBytes`).

**Delivery — Phase 3 is drafted as sequential epics** in `TASKS.md` (P3-xxx, rough draft):

- **Epic 0 — Adopt the landed `akg-ts` write-path.** Release + dep bump + crash-atomicity verification + precise compaction hint + compaction cadence. Unblocks the durability/WAL gains already built in the SDK.
- **Epic 1 — Ranking & richer retrieval.** Clamp `strength`/`confidence`, a scan-once ranking module, multi-hop/neighborhood traversal, and wiring ranking into `memory_recall`/`memory_recent`.
- **Epic 2 — Maintenance & consolidation (single store).** Near-duplicate/superseded consolidation, pruning sweeps, and status/maintenance surfaces.
- **Epic 3 — Cross-file merge (GAP-2). _Deferred — demand-driven._** Choose a resolution policy against `08-merge.md`, build the app-side merge/import path with provenance preservation, and expose it as a tool/command (and potentially a git merge driver for `.akg`). Not started until a concrete multi-file need appears.
- **Epic 4 — Named stores/scopes. _Deferred — likely a separate Phase 4._** Store registry + scope routing and sensitive-store (at-rest encryption) handling. Largely dissolved by the realization that a single `.akg` is directly committable for sharing; what remains (a private/shared split, encrypted sensitive store) is unproven demand.

Exit criteria:

- Long-lived project memory remains relevant, inspectable, and maintainable.
- The package consumes the crash-safe `akg-ts` release and surfaces a precise, non-spammy compaction recommendation.
- Two memory files can be merged with conflict preservation and without losing source provenance.

## 13. Suggested Implementation Architecture

### Repository/package structure

```text
pi-memory-akg/
├── package.json                 # Pi package manifest, dependencies, metadata
├── README.md                    # install/dev usage and memory policy
├── PRD.md                       # product requirements
├── extensions/
│   └── akg-memory.ts            # Pi extension entrypoint
├── skills/
│   └── akg-memory/
│       └── SKILL.md             # selective durable memory policy
├── prompts/
│   ├── memory-review.md         # optional review workflow
│   ├── memory-cleanup.md        # optional cleanup workflow
│   └── memory-status.md         # optional model-assisted status prompt
└── src/
    ├── memory-store.ts          # AKG open/commit/close lifecycle
    ├── schema.ts                # node/relation/tag/type definitions
    ├── settings.ts              # package settings and defaults
    ├── risk-policy.ts           # risk-based confirmation checks
    ├── retrieval.ts             # candidate generation + result formatting
    ├── provenance.ts            # session/cwd/source metadata helpers
    ├── maintenance.ts           # stats/compact/cleanup helpers
    └── tools/
        ├── remember.ts
        ├── recall.ts
        ├── link.ts
        ├── forget.ts
        ├── recent.ts
        ├── inspect.ts
        └── status.ts
```

### Package manifest baseline

`package.json` should include the `pi-package` keyword and an explicit Pi manifest. Runtime dependencies such as `akg-ts` belong in `dependencies`. Pi-provided packages imported by the extension, such as `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, and `typebox`, should be listed as peer dependencies with `"*"` ranges.

Example baseline:

```json
{
  "name": "pi-memory-akg",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "keywords": ["pi-package"],
  "dependencies": {
    "akg-ts": "^0.0.0"
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-ai": "*",
    "typebox": "*"
  },
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"]
  }
}
```

The exact `akg-ts` version should be pinned or ranged according to the SDK version validated in Phase 0.

### Extension modules

The extension should remain the runtime owner of memory behavior. Source modules under `src/` provide implementation details, while `extensions/akg-memory.ts` wires them into Pi lifecycle hooks, tools, and commands.

### Pi lifecycle usage

- `session_start`: initialize store, derive project/session context, register/update status if needed.
- `before_agent_start`: inject the tiny memory availability/index hint, if enabled. Prefer this hook for Phase 1 because it runs before the agent loop and can modify prompt context predictably.
- Tool execution: run `memory_*` tools against the single store instance/write queue, enforce result budgets, and apply risk-based confirmation policy.
- Extension command: register `/memory-status` as deterministic operator-facing status UX; an optional prompt template may provide model-assisted interpretation later.
- `agent_end` or later phase hooks: optionally extract candidate memories in future phases only.
- `session_compact` / `session_tree`: later harvest compaction and branch summaries.
- `session_shutdown`: commit/close store.

### Tool surface summary

| Tool | Purpose |
| --- | --- |
| `memory_remember` | Create/update a durable typed memory record |
| `memory_recall` | Retrieve compact candidate records with filters |
| `memory_link` | Add typed relationship between records |
| `memory_forget` | Deactivate, supersede, or explicitly hard-delete memory |
| `memory_recent` | List recent records by type/tag/status |
| `memory_inspect` | Inspect full deterministic record details |
| `/memory-status` | Extension command showing deterministic memory package status |

## 14. Resolved Product Decisions

1. `.pi/memory.akg` sharing policy is project-owned. The package must not auto-edit `.gitignore`; docs/status should recommend gitignore-by-default for private memory and explicit opt-in for shared curated memory.
2. The tiny memory status/index hint is enabled by default and controlled by package settings. Projects can disable it, but Phase 1 defaults to the knowledge-base-style affordance.
3. Initial budgets are character-based: 400 characters for the hidden hint and 6,000 characters per retrieval/maintenance tool result by default, with compact deterministic truncation and lower caller-configurable limits.
4. Phase 1 includes a lightweight `/memory-status` extension command in addition to model-callable tools, with optional prompt/template support later. It reports enabled state, path, hint/budget settings, approximate counts, recent memory titles, gitignore recommendation, available tools, and suggested next actions without dumping full memory records.
5. Explicit memories use risk-based confirmation without being overwhelming. Normal project memories write directly; sensitive, secret-like, low-confidence/inferred, ambiguous, or destructive operations require confirmation when possible or fail with guidance when confirmation is unavailable. A stricter ask-before-every-write setting may be offered.

### Phase 2 decisions (resolved 2026-05-30)

6. **Principle 5 is scoped to retrieval.** "Candidate generation is deterministic" governs how memory is *retrieved* (deterministic filtering of the graph). Deciding what is worth extracting *from free-form conversation* is a judgment task and is delegated to an LLM/agent, not to deterministic keyword heuristics. Determinism in Phase 2 lives in the plumbing — dedup, provenance, the queue, and revert.
7. **Automatic extraction is hybrid and summary-first.** A bounded LLM extraction pass runs only on Pi's distilled compaction and branch summaries; raw completed turns receive at most a lightweight, opt-in deterministic nudge. This keeps capture low-noise and bounds token cost (`autoCaptureSources`, `liveTurnNudge` settings).
8. **The control layer is the product, and it is mode-independent.** Every captured or suggested memory passes through a visible pending queue, carries provenance, and is reversible by a forward forget operation. This holds identically in interactive and headless modes; it is what delivers transparency and "take back control."
9. **Headless / RPC behavior is first-class.** Sessions with no UI (`ctx.hasUI === false`) default to risk-gated auto-commit: confident, safe candidates write as `unreviewed`/`source: auto` with full provenance; sensitive or low-confidence ones defer to the queue. Interactive sessions never auto-commit — they defer for human review. The default is configurable via `headlessPolicy` (`auto-commit` | `defer` | `off`), and an orchestrator can audit and revert via the RPC event/command stream.

## 15. Readiness State

This PRD is comprehensive and the Section 14 product policy questions are resolved. Phases 0–2 are implemented and validated against `akg-ts@0.1.3` and Pi 0.78.0, with a Vitest baseline (122 tests) and live-wiring validation (validation notes have been archived; see git history). Phase 2 product decisions are resolved (§14, items 6–9). Phase 3 is drafted into a rough task batch in `TASKS.md` (P3-xxx, organized as Epics 0–4); the Phase 3 tasks are a planning draft, not yet implementation-ready. The crash-safe write-path is now consumed (`0.1.3`), so the immediate next step is single-user dogfooding rather than further roadmap build-out.

Resolved naming decision: the package/repository should be `rgumeny/pi-memory-akg` unless a later publishing step requires a separate npm package name.
