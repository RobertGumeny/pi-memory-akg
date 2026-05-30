import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, StringEnum } from "@earendil-works/pi-ai";
import { MemoryStore } from "../src/memory-store.js";
import { loadSettings } from "../src/settings.js";
import { NODE_TYPES, RELATION_TYPES } from "../src/schema.js";
import { handleRemember } from "../src/tools/remember.js";
import { handleRecall } from "../src/tools/recall.js";
import { handleLink } from "../src/tools/link.js";
import { handleForget } from "../src/tools/forget.js";
import { handleRecent } from "../src/tools/recent.js";
import { handleInspect } from "../src/tools/inspect.js";
import { handleStatus } from "../src/tools/status.js";

const HINT_TEXT =
	"Project AKG memory is available at .pi/memory.akg. Use memory_recall, memory_recent, or memory_inspect when durable project context may affect this task.";

const MEMORY_UNAVAILABLE = "Memory is not available: store failed to initialize. Check stderr for details.";

export default function akgMemoryExtension(pi: ExtensionAPI) {
	const settings = loadSettings();
	let store: MemoryStore | null = null;

	pi.on("session_start", async (_event, ctx) => {
		try {
			store = await MemoryStore.open(ctx.cwd, settings);
			process.stderr.write(`[akg-memory] session_start fired: opened ${store.filePath}\n`);
		} catch (err) {
			process.stderr.write(
				`[akg-memory] session_start error — memory disabled: ${(err as Error).message}\n`,
			);
			store = null;
		}
	});

	pi.on("before_agent_start", async (event, _ctx) => {
		process.stderr.write("[akg-memory] before_agent_start fired\n");
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
				process.stderr.write("[akg-memory] session_shutdown fired: committed and closed\n");
			} catch (err) {
				process.stderr.write(
					`[akg-memory] session_shutdown error: ${(err as Error).message}\n`,
				);
			}
		} else {
			process.stderr.write("[akg-memory] session_shutdown fired\n");
		}
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

	// ── /memory-status command ───────────────────────────────────────────────────
	pi.registerCommand("memory-status", {
		description: "Show AKG memory package status: file path, counts by type/status, recent titles, available tools",
		handler: async (_args, ctx) => {
			const text = await handleStatus(store, settings);
			ctx.ui.notify(text, "info");
		},
	});
}
