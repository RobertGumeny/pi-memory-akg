# Changelog

All notable changes to `pi-memory-akg` are documented here. This project follows
[Semantic Versioning](https://semver.org/); pre-1.0 alphas may change behavior
between releases.

## [0.1.0-alpha.1] — 2026-06-09

First public pre-alpha. Focus: explicit, durable, project-local memory for Pi,
backed by an AKG knowledge graph.

### Added
- Explicit memory tools: `memory_remember`, `memory_recall`, `memory_recent`,
  `memory_inspect`, `memory_link`, `memory_forget`.
- `/memory-status` — concise, operator-readable status (file, counts by
  type/status, recent refs, next actions).
- `/memory-cleanup` — explicit curation pass for stale/duplicate/superseded
  memory.
- Secret-risk gating on writes (likely-secret content is rejected or gated
  behind explicit confirmation).
- Memory persists across sessions in `.pi/memory.akg`.

### Changed
- **Auto-capture is experimental and disabled by default.** When off, its tools
  (`memory_review`, `memory_revert`), commands (`/memory-review`,
  `/memory-revert`), and compaction/branch ingestion hooks are not registered.
  Opt in via the `autoCaptureEnabled` setting.
- `/memory-status` reformatted for readability (was a verbose dump).
- Lifecycle/diagnostic logging is now opt-in via the `debug` setting; a normal
  session is quiet on stderr.

### Fixed
- Memory writes no longer fail with `invalid component` when a tag contains
  hyphens or capitals (e.g. a repo name like `tiny-notes`): tags are normalized
  to valid AKG components. Node-id slugs keep their conventional hyphenated form.
- Titles that reduce to an empty slug now fall back to a hashed id instead of
  failing.
- Malformed supersede refs return a clear message instead of a raw graph error.

### Known limitations
- Recall output is compact and tool-oriented rather than natural language.
- Auto-capture (compaction/branch summary extraction) is experimental and off by
  default; its live behavior is not yet dogfooded through real Pi lifecycle hooks.
- Scoped/layered memory stores are on the roadmap, not implemented.
- Cleanup is an explicit workflow, not automatic memory management.

[0.1.0-alpha.1]: https://github.com/RobertGumeny/pi-memory-akg/releases/tag/v0.1.0-alpha.1
