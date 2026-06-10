import crypto from "crypto";
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

/** 8-char content hash, used for collision-safe fallback ids. */
export function shortHash(input: string): string {
	return crypto.createHash("sha256").update(input).digest("hex").slice(0, 8);
}

/**
 * Convert a title into a node-id slug. Node ids are validated by akg-ts's
 * `validateNodeID` (no colons, non-empty, ≤64 bytes) — hyphens and mixed runs
 * are fine — so we keep the conventional hyphen separator. A title that reduces
 * to empty (e.g. all punctuation) falls back to a hashed id so we never pass an
 * empty id to `putNode` (which would throw `empty node ID`).
 */
export function slugify(title: string): string {
	const base = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-") // any run of non-alphanumerics → single hyphen
		.replace(/^-+|-+$/g, "") // trim leading/trailing hyphens
		.slice(0, 60)
		.replace(/-+$/g, ""); // trim a trailing hyphen the slice may have created
	return base || `note-${shortHash(title)}`;
}

/**
 * Normalize a user- or model-supplied tag to a valid akg-ts component. UNLIKE
 * node ids, tags are validated with `validateTag` → `validateComponent`, which
 * accepts only `[a-z0-9_]` with single, non-edge underscores — so a hyphenated
 * or capitalized tag (e.g. a repo name like `tiny-notes`) throws
 * `invalid component` unless normalized. Returns `null` for a tag that reduces
 * to empty so callers can drop it.
 */
export function normalizeTag(tag: string): string | null {
	const t = tag
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, 60)
		.replace(/_+$/g, "");
	return t || null;
}

/** akg-ts component grammar (`validateComponent`): `[a-z0-9]` runs joined by single underscores. */
const COMPONENT_RE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

/**
 * Validate a caller-supplied `type/id` supersede ref so a malformed ref fails
 * with a clear message instead of a raw akg-ts throw from the downstream
 * `putEdge`. The `type` half is a component (`[a-z0-9_]`); the `id` half follows
 * the laxer node-id rule (non-empty, no colon, hyphens allowed). Returns an
 * error message if malformed, or `null` if the ref shape is valid.
 */
export function validateRefArg(ref: string): string | null {
	const slash = ref.indexOf("/");
	const type = slash > 0 ? ref.slice(0, slash) : "";
	const id = slash > 0 ? ref.slice(slash + 1) : "";
	const idOk = id.length > 0 && id.length <= 64 && !id.includes(":");
	if (!type || !COMPONENT_RE.test(type) || !idOk) {
		return `Invalid ref "${ref}". A ref must look like "type/some-id" — a lowercase type (letters, digits, underscores) and a non-empty id.`;
	}
	return null;
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

	// Validate the supersede ref up front so a malformed ref fails with a clear
	// message before we write anything (akg-ts would otherwise throw raw downstream).
	if (args.ref !== undefined) {
		const refErr = validateRefArg(args.ref);
		if (refErr) return refErr;
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

	// Normalize tags to valid akg-ts components (hyphenated/uppercase tags would
	// otherwise throw `invalid component`); drop empties and dedupe.
	const normalizedTags = [
		...new Set(tags.map(normalizeTag).filter((t): t is string => t !== null)),
	];

	const nodeRef = s.putNode(type, slug, { title, body, meta }, normalizedTags);

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
