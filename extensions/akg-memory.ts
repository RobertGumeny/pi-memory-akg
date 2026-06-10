import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, StringEnum } from "@earendil-works/pi-ai";
import { MemoryStore } from "../src/memory-store.js";
import { loadSettings } from "../src/settings.js";
import { NODE_TYPES, RELATION_TYPES } from "../src/schema.js";
import { CandidateQueue } from "../src/candidate-queue.js";
import { runAutoCapture } from "../src/auto-capture.js";
import { makeLlmFn, type LlmFn } from "../src/llm.js";
import { handleRemember } from "../src/tools/remember.js";
import { handleRecall } from "../src/tools/recall.js";
import { handleLink } from "../src/tools/link.js";
import { handleForget } from "../src/tools/forget.js";
import { handleRecent } from "../src/tools/recent.js";
import { handleInspect } from "../src/tools/inspect.js";
import { handleStatus } from "../src/tools/status.js";
import { handleReview, runInteractiveReview } from "../src/tools/review.js";
import { handleRevert, runInteractiveRevert, type RevertMode } from "../src/tools/revert.js";

const HINT_TEXT =
	"Project AKG memory is available at .pi/memory.akg. Use memory_recall, memory_recent, or memory_inspect when durable project context may affect this task.";

const MEMORY_UNAVAILABLE = "Memory is not available: store failed to initialize. Check stderr for details.";

export default function akgMemoryExtension(pi: ExtensionAPI) {
	const settings = loadSettings();
	let store: MemoryStore | null = null;
	let queue: CandidateQueue | null = null;
	let llm: LlmFn | null = null;
	let nudgedThisSession = false;

	// Lifecycle/diagnostic logging is opt-in via the `debug` setting so a normal
	// session stays quiet in the TUI/stderr. Error-path writes stay unconditional.
	const dlog = (msg: string) => {
		if (settings.debug) process.stderr.write(msg);
	};

	pi.on("session_start", async (_event, ctx) => {
		try {
			store = await MemoryStore.open(ctx.cwd, settings);
			// The candidate queue only backs auto-capture; skip it when disabled.
			queue = settings.autoCaptureEnabled ? CandidateQueue.open(ctx.cwd, settings) : null;
			llm = makeLlmFn(ctx.model, ctx.modelRegistry);
			nudgedThisSession = false;
			dlog(
				`[akg-memory] session_start: opened ${store.filePath}` +
					(queue ? `, queue ${queue.filePath}` : "") +
					"\n",
			);
		} catch (err) {
			process.stderr.write(
				`[akg-memory] session_start error — memory disabled: ${(err as Error).message}\n`,
			);
			store = null;
			queue = null;
			llm = null;
		}
	});

	/**
	 * Run the auto-capture pipeline over one distilled summary. Fully guarded:
	 * a model failure or any pipeline error is logged and swallowed — auto-capture
	 * must never crash a session (gate-then-write, so the graph stays consistent).
	 */
	async function captureFromSummary(
		summaryText: string,
		origin: "compaction" | "branch",
		summaryEntryId: string | undefined,
		ctx: {
			cwd: string;
			hasUI: boolean;
			signal: AbortSignal | undefined;
			sessionManager: { getSessionId(): string };
		},
	): Promise<void> {
		if (!settings.autoCaptureEnabled) return;
		if (!store?.isOpen || !queue || !llm) return;
		if (!settings.autoCaptureSources.includes(origin)) return;
		if (!summaryText.trim()) return;

		// Stamp the session id so `memory_revert`/`findUnreviewed` can narrow by
		// session. getSessionId() can throw for an unsaved/ephemeral session, so
		// fall back to undefined (provenance omits it).
		let sessionId: string | undefined;
		try {
			sessionId = ctx.sessionManager.getSessionId();
		} catch {
			sessionId = undefined;
		}

		try {
			const report = await runAutoCapture({
				store,
				queue,
				summaryText,
				origin,
				provenanceBase: { cwd: ctx.cwd, sessionId, summaryEntryId },
				llm,
				settings,
				hasUI: ctx.hasUI,
				signal: ctx.signal,
			});
			dlog(
				`[akg-memory] auto-capture (${origin}): committed ${report.committed.length}, ` +
					`deferred ${report.deferred.length}, dropped ${report.dropped}, duplicates ${report.duplicates}\n`,
			);
		} catch (err) {
			process.stderr.write(
				`[akg-memory] auto-capture (${origin}) error — skipped: ${(err as Error).message}\n`,
			);
		}
	}

	// Auto-capture is experimental and OFF by default for alpha: its ingestion
	// hooks and the review nudge only register when explicitly enabled.
	if (settings.autoCaptureEnabled) {
		pi.on("session_compact", async (event, ctx) => {
			await captureFromSummary(
				event.compactionEntry.summary,
				"compaction",
				event.compactionEntry.id,
				ctx,
			);
		});

		pi.on("session_tree", async (event, ctx) => {
			if (!event.summaryEntry) return;
			await captureFromSummary(
				event.summaryEntry.summary,
				"branch",
				event.summaryEntry.id,
				ctx,
			);
		});

		pi.on("agent_end", async (_event, ctx) => {
			// Deterministic live-turn nudge: no LLM pass. At most one notify per session,
			// only when opted in, UI is present, and there are pending candidates to review.
			if (!settings.liveTurnNudge || !ctx.hasUI || nudgedThisSession || !queue) return;
			const pending = queue.list().length;
			if (pending === 0) return;
			nudgedThisSession = true;
			ctx.ui.notify(
				`AKG memory: ${pending} pending candidate(s). Run /memory-review to triage them.`,
				"info",
			);
		});
	}

	pi.on("before_agent_start", async (event, _ctx) => {
		dlog("[akg-memory] before_agent_start fired\n");
		if (!settings.hintEnabled || !store?.isOpen) return;

		const inner = HINT_TEXT.slice(0, settings.hintBudget - 40); // reserve room for XML wrapper
		const hint = `\n\n<akg-memory-status>\n${inner}\n</akg-memory-status>`;
		const injected = event.systemPrompt + hint;

		// Ensure total injected hint does not exceed hintBudget
		if (hint.length > settings.hintBudget) {
			const trimmed = hint.slice(0, settings.hintBudget);
			return { systemPrompt: event.systemPrompt + trimmed };
		}

		return { systemPrompt: injected };
	});

	pi.on("session_shutdown", async (_event, _ctx) => {
		if (store?.isOpen) {
			try {
				await store.commit();
				await store.close();
				dlog("[akg-memory] session_shutdown: committed and closed\n");
			} catch (err) {
				process.stderr.write(
					`[akg-memory] session_shutdown error: ${(err as Error).message}\n`,
				);
			}
		} else {
			dlog("[akg-memory] session_shutdown: no open store\n");
		}
		// The candidate queue is durable per-append (JSONL fsync), so there is
		// nothing to flush — just drop the references.
		queue = null;
		llm = null;
	});

	// ── memory_remember ──────────────────────────────────────────────────────────
	pi.registerTool({
		name: "memory_remember",
		label: "Memory Remember",
		description:
			"Store or update a durable typed memory record in the project AKG knowledge graph. " +
			"Use for decisions, constraints, preferences, tasks, artifacts, and repo facts that should persist across sessions.",
		parameters: Type.Object({
			type: StringEnum([...NODE_TYPES] as string[], {
				description: "Node type (e.g. decision, constraint, preference, task, artifact)",
			}),
			title: Type.String({ description: "Short descriptive title for this memory record" }),
			body: Type.String({ description: "Full content of the memory record" }),
			tags: Type.Optional(
				Type.Array(Type.String(), { description: "Optional tags (e.g. durable, design, user_pref)" }),
			),
			ref: Type.Optional(
				Type.String({ description: "ID of an existing record this supersedes, e.g. decision/old-slug" }),
			),
			confirm: Type.Optional(
				Type.Boolean({
					description: "Set to true to confirm writing a sensitive or low-confidence record",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!store?.isOpen) {
				return { content: [{ type: "text", text: MEMORY_UNAVAILABLE }], details: {} };
			}
			const text = await handleRemember(store, settings, params, { cwd: ctx.cwd }, ctx.hasUI);
			return { content: [{ type: "text", text }], details: {} };
		},
	});

	// ── memory_recall ────────────────────────────────────────────────────────────
	pi.registerTool({
		name: "memory_recall",
		label: "Memory Recall",
		description:
			"Retrieve compact candidate memory records filtered by type, tag, IDs, status, or graph neighborhood. " +
			"Does not perform full-text search — use type, tag, and ID filters for deterministic results.",
		parameters: Type.Object({
			types: Type.Optional(
				Type.Array(StringEnum([...NODE_TYPES] as string[]), {
					description: "Filter by node types",
				}),
			),
			tags: Type.Optional(
				Type.Array(Type.String(), { description: "Filter by tags (all must match)" }),
			),
			ids: Type.Optional(
				Type.Array(Type.String(), { description: "Fetch specific node IDs (type/slug format)" }),
			),
			limit: Type.Optional(
				Type.Number({ description: "Max records to return (default 10, max 50)" }),
			),
			neighborOf: Type.Optional(
				Type.String({ description: "Return graph neighbors of this node ID" }),
			),
			status: Type.Optional(
				Type.String({ description: "Filter by status metadata (e.g. active, inactive, superseded)" }),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			if (!store?.isOpen) {
				return { content: [{ type: "text", text: MEMORY_UNAVAILABLE }], details: {} };
			}
			const text = await handleRecall(store, settings, params);
			return { content: [{ type: "text", text }], details: {} };
		},
	});

	// ── memory_link ──────────────────────────────────────────────────────────────
	pi.registerTool({
		name: "memory_link",
		label: "Memory Link",
		description:
			"Create a typed relationship edge between two existing memory records. " +
			"Both records must exist. If either is missing, no edge is created.",
		parameters: Type.Object({
			fromId: Type.String({ description: "Source node ID in type/slug format, e.g. decision/use-akg" }),
			toId: Type.String({ description: "Target node ID in type/slug format" }),
			relation: StringEnum([...RELATION_TYPES] as string[], {
				description: "Relation type (e.g. affects, depends_on, supersedes)",
			}),
			strength: Type.Optional(
				Type.Number({ description: "Edge strength 0-1 (default 0.5)" }),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			if (!store?.isOpen) {
				return { content: [{ type: "text", text: MEMORY_UNAVAILABLE }], details: {} };
			}
			const text = await handleLink(store, params);
			return { content: [{ type: "text", text }], details: {} };
		},
	});

	// ── memory_forget ────────────────────────────────────────────────────────────
	pi.registerTool({
		name: "memory_forget",
		label: "Memory Forget",
		description:
			"Deactivate, supersede, or delete a memory record. " +
			"Default mode is 'deactivate' (sets status: inactive). Prefer deactivate or supersede over delete for historical provenance.",
		parameters: Type.Object({
			id: Type.String({ description: "Node ID in type/slug format to forget" }),
			mode: Type.Optional(
				StringEnum(["deactivate", "supersede", "delete"] as string[], {
					description: "How to forget: deactivate (default), supersede, or hard delete",
				}),
			),
			supersededBy: Type.Optional(
				Type.String({
					description: "ID of the replacement record when mode is supersede",
				}),
			),
			cascade: Type.Optional(
				Type.Boolean({
					description: "When mode is delete, also remove all edges (required if node has live edges)",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			if (!store?.isOpen) {
				return { content: [{ type: "text", text: MEMORY_UNAVAILABLE }], details: {} };
			}
			const text = await handleForget(store, params as Parameters<typeof handleForget>[1]);
			return { content: [{ type: "text", text }], details: {} };
		},
	});

	// ── memory_recent ────────────────────────────────────────────────────────────
	pi.registerTool({
		name: "memory_recent",
		label: "Memory Recent",
		description:
			"List the most recently updated memory records, ordered by update time descending. " +
			"Optionally filter by type, tag, or status.",
		parameters: Type.Object({
			limit: Type.Optional(
				Type.Number({ description: "Max records to return (default 10)" }),
			),
			types: Type.Optional(
				Type.Array(StringEnum([...NODE_TYPES] as string[]), {
					description: "Filter by node types",
				}),
			),
			tags: Type.Optional(
				Type.Array(Type.String(), { description: "Filter by tags" }),
			),
			status: Type.Optional(
				Type.String({ description: "Filter by status (default excludes inactive/superseded)" }),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			if (!store?.isOpen) {
				return { content: [{ type: "text", text: MEMORY_UNAVAILABLE }], details: {} };
			}
			const text = await handleRecent(store, settings, params);
			return { content: [{ type: "text", text }], details: {} };
		},
	});

	// ── memory_inspect ───────────────────────────────────────────────────────────
	pi.registerTool({
		name: "memory_inspect",
		label: "Memory Inspect",
		description:
			"Inspect the full details of a specific memory record by ID, including metadata and edges. " +
			"Use after memory_recall to drill into a candidate that looks relevant.",
		parameters: Type.Object({
			id: Type.String({ description: "Node ID in type/slug format, e.g. decision/use-akg" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			if (!store?.isOpen) {
				return { content: [{ type: "text", text: MEMORY_UNAVAILABLE }], details: {} };
			}
			const text = await handleInspect(store, settings, params);
			return { content: [{ type: "text", text }], details: {} };
		},
	});

	// ── memory_review (experimental — registered only when auto-capture is on) ───
	if (settings.autoCaptureEnabled) pi.registerTool({
		name: "memory_review",
		label: "Memory Review",
		description:
			"List, accept, or reject pending auto-captured memory candidates in the review queue. " +
			"Accepting promotes a candidate to an active memory record (with optional edits); rejecting discards it.",
		parameters: Type.Object({
			action: StringEnum(["list", "accept", "reject"] as string[], {
				description: "list pending candidates, or accept/reject a candidate by id",
			}),
			id: Type.Optional(
				Type.String({ description: "Candidate queue id (required for accept/reject)" }),
			),
			edits: Type.Optional(
				Type.Object(
					{
						type: Type.Optional(StringEnum([...NODE_TYPES] as string[])),
						title: Type.Optional(Type.String()),
						body: Type.Optional(Type.String()),
						tags: Type.Optional(Type.Array(Type.String())),
					},
					{ description: "Optional edits applied when accepting a candidate" },
				),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			if (!store?.isOpen || !queue) {
				return { content: [{ type: "text", text: MEMORY_UNAVAILABLE }], details: {} };
			}
			const text = await handleReview(
				queue,
				store,
				settings,
				params as Parameters<typeof handleReview>[3],
			);
			return { content: [{ type: "text", text }], details: {} };
		},
	});

	// ── memory_revert (experimental — registered only when auto-capture is on) ───
	if (settings.autoCaptureEnabled) pi.registerTool({
		name: "memory_revert",
		label: "Memory Revert",
		description:
			"Sweep auto-captured 'unreviewed' memories. Without confirm it is a dry run (lists what would be undone); " +
			"with confirm: true it deactivates (or deletes) them. A forward forget, not a rollback.",
		parameters: Type.Object({
			mode: Type.Optional(
				StringEnum(["deactivate", "delete"] as string[], {
					description: "deactivate (default) sets status inactive; delete cascade-removes",
				}),
			),
			origin: Type.Optional(
				StringEnum(["compaction", "branch"] as string[], {
					description: "Only revert captures from this origin",
				}),
			),
			sinceMs: Type.Optional(
				Type.Number({ description: "Only revert nodes updated within the last N milliseconds" }),
			),
			confirm: Type.Optional(
				Type.Boolean({ description: "Set true to apply the revert (otherwise dry run)" }),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			if (!store?.isOpen) {
				return { content: [{ type: "text", text: MEMORY_UNAVAILABLE }], details: {} };
			}
			const text = await handleRevert(store, params as Parameters<typeof handleRevert>[1]);
			return { content: [{ type: "text", text }], details: {} };
		},
	});

	// ── /memory-status command ───────────────────────────────────────────────────
	pi.registerCommand("memory-status", {
		description: "Show AKG memory package status: file path, counts by type/status, recent titles, available tools",
		handler: async (_args, ctx) => {
			const text = await handleStatus(store, settings, queue?.list().length ?? 0);
			ctx.ui.notify(text, "info");
		},
	});

	// ── /memory-review command (experimental — only when auto-capture is on) ─────
	if (settings.autoCaptureEnabled) pi.registerCommand("memory-review", {
		description: "Walk pending auto-captured memory candidates and accept/reject each",
		handler: async (_args, ctx) => {
			if (!store?.isOpen || !queue) {
				ctx.ui.notify(MEMORY_UNAVAILABLE, "error");
				return;
			}
			await runInteractiveReview(queue, store, ctx.ui, ctx.hasUI);
		},
	});

	// ── /memory-revert command (experimental — only when auto-capture is on) ─────
	if (settings.autoCaptureEnabled) pi.registerCommand("memory-revert", {
		description: "Dry-run then revert auto-captured unreviewed memories",
		handler: async (args, ctx) => {
			if (!store?.isOpen) {
				ctx.ui.notify(MEMORY_UNAVAILABLE, "error");
				return;
			}
			const mode: RevertMode = args?.trim() === "delete" ? "delete" : "deactivate";
			await runInteractiveRevert(store, ctx.ui, ctx.hasUI, { mode });
		},
	});
}
