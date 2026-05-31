import type { MemoryStore } from "./memory-store.js";
import type { MemoryCandidate } from "./candidate-queue.js";
import { slugify } from "./tools/remember.js";
import { parseRef } from "./ref.js";
import {
	META_CWD,
	META_SESSION_ID,
	META_ENTRY_IDS,
	META_SOURCE,
	META_STATUS,
	META_LAST_SEEN_AT,
} from "./schema.js";

/**
 * Flatten a candidate's auto-provenance into node meta and write it to the
 * graph with the given `status`. Shared by the auto-capture orchestration
 * (writes `unreviewed`) and the review surface (writes `active` on accept).
 *
 * On an "update" classification the caller passes `existingId` ("type/id") so we
 * upsert in place rather than creating a sibling; otherwise the id is the slug
 * of the (possibly edited) title. Returns the written node ref ("type/id").
 */
export function writeCandidateNode(
	store: MemoryStore,
	candidate: Pick<MemoryCandidate, "type" | "title" | "body" | "tags" | "provenance">,
	status: string,
	existingId?: string,
): string {
	const id = existingId ? parseRef(existingId).id : slugify(candidate.title);
	const p = candidate.provenance;

	const meta: Record<string, unknown> = {
		[META_STATUS]: status,
		[META_SOURCE]: p.source ?? "auto",
		[META_LAST_SEEN_AT]: p.last_seen_at,
	};
	if (p.cwd !== undefined) meta[META_CWD] = p.cwd;
	if (p.session_id !== undefined) meta[META_SESSION_ID] = p.session_id;
	if (p.entry_ids !== undefined) meta[META_ENTRY_IDS] = p.entry_ids;
	if (p.origin !== undefined) meta.origin = p.origin;
	if (p.summary_entry_id !== undefined) meta.summary_entry_id = p.summary_entry_id;
	if (p.confidence !== undefined) meta.confidence = p.confidence;

	store.store.putNode(
		candidate.type,
		id,
		{ title: candidate.title, body: candidate.body, meta },
		candidate.tags ?? [],
	);
	return `${candidate.type}/${id}`;
}
