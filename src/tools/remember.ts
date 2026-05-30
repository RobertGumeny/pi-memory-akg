import type { MemoryStore } from "../memory-store.js";
import type { Settings } from "../settings.js";
import { assessRisk } from "../risk-policy.js";
import { buildProvenance, mergeProvenance } from "../provenance.js";
import type { ProvenanceMetadata } from "../provenance.js";
import {
	META_CWD,
	META_SESSION_ID,
	META_ENTRY_IDS,
	META_SOURCE,
	META_STATUS,
	META_LAST_SEEN_AT,
} from "../schema.js";

export function slugify(title: string): string {
	return title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-") // any run of non-alphanumerics → single hyphen
		.replace(/^-+|-+$/g, "") // trim leading/trailing hyphens
		.slice(0, 60)
		.replace(/-+$/g, ""); // trim a trailing hyphen the slice may have created
}

export function parseCallerProvenance(
	p: Partial<ProvenanceMetadata>,
): Record<string, unknown> {
	const meta: Record<string, unknown> = {};
	if (p.cwd !== undefined) meta[META_CWD] = p.cwd;
	if (p.session_id !== undefined) meta[META_SESSION_ID] = p.session_id;
	if (p.entry_ids !== undefined) meta[META_ENTRY_IDS] = p.entry_ids;
	if (p.source !== undefined) meta[META_SOURCE] = p.source;
	if (p.last_seen_at !== undefined) meta[META_LAST_SEEN_AT] = p.last_seen_at;
	return meta;
}

export async function handleRemember(
	store: MemoryStore,
	settings: Settings,
	args: {
		type: string;
		title: string;
		body: string;
		tags?: string[];
		provenance?: Partial<ProvenanceMetadata>;
		ref?: string;
		confirm?: boolean;
	},
	ctx?: { cwd?: string; sessionId?: string; entryIds?: string[]; source?: string },
	uiAvailable = true,
): Promise<string> {
	const { type, title, body, tags = [], confirm = false } = args;
	const s = store.store;

	const risk = assessRisk({ type, title, body, tags }, uiAvailable, settings);

	if (risk.action === "reject") {
		return risk.reason;
	}

	if (risk.action === "confirm" && !confirm) {
		return `Confirmation required before storing this memory: ${risk.reason}. Use memory_remember with explicit confirm: true to proceed.`;
	}

	const slug = slugify(title);

	// Build merged provenance metadata
	const sessionProv = buildProvenance({
		cwd: ctx?.cwd,
		sessionId: ctx?.sessionId,
		entryIds: ctx?.entryIds,
		source: ctx?.source ?? "manual",
	});

	const callerProv = args.provenance ? parseCallerProvenance(args.provenance) : {};

	const merged = mergeProvenance(sessionProv, args.provenance ?? {});
	const meta: Record<string, unknown> = {
		...callerProv,
		[META_CWD]: merged.cwd ?? ctx?.cwd,
		[META_LAST_SEEN_AT]: merged.last_seen_at,
	};
	if (merged.session_id !== undefined) meta[META_SESSION_ID] = merged.session_id;
	if (merged.entry_ids !== undefined) meta[META_ENTRY_IDS] = merged.entry_ids;
	if (merged.source !== undefined) meta[META_SOURCE] = merged.source;

	// Remove undefined values
	for (const key of Object.keys(meta)) {
		if (meta[key] === undefined) delete meta[key];
	}

	const nodeRef = s.putNode(type, slug, { title, body, meta }, tags);

	// If caller provided a ref to supersede, add edge from new node to old
	if (args.ref) {
		const slash = args.ref.indexOf("/");
		if (slash > 0) {
			const refType = args.ref.slice(0, slash);
			const refId = args.ref.slice(slash + 1);
			const refNode = s.getNode(refType, refId);
			if (refNode) {
				s.putEdge(nodeRef, "supersedes", { type: refType, id: refId }, {});
			}
		}
	}

	await store.commit();

	return `Remembered ${type}: ${title}\nref: ${type}/${slug}`;
}
