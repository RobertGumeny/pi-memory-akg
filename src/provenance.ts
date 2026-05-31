export type CaptureOrigin = "compaction" | "branch" | "turn";

export interface ProvenanceMetadata {
	cwd?: string;
	session_id?: string;
	entry_ids?: string[];
	source?: string;
	last_seen_at: string;
	// Auto-capture provenance (Phase 2) — set only by buildAutoProvenance.
	origin?: CaptureOrigin;
	summary_entry_id?: string;
	confidence?: number;
}

export function buildProvenance(ctx: {
	cwd?: string;
	sessionId?: string;
	entryIds?: string[];
	source?: string;
}): ProvenanceMetadata {
	const result: ProvenanceMetadata = {
		last_seen_at: new Date().toISOString(),
	};
	if (ctx.cwd !== undefined) result.cwd = ctx.cwd;
	if (ctx.sessionId !== undefined) result.session_id = ctx.sessionId;
	if (ctx.entryIds !== undefined) result.entry_ids = ctx.entryIds;
	if (ctx.source !== undefined) result.source = ctx.source;
	return result;
}

/**
 * Build provenance for an auto-captured memory (Phase 2). Always stamps
 * `source: "auto"`, carries the capture `origin`, the model `confidence`, and
 * (when known) the `summary_entry_id` of the distilled summary it came from.
 * Undefined inputs are omitted, matching buildProvenance.
 */
export function buildAutoProvenance(input: {
	cwd?: string;
	sessionId?: string;
	entryIds?: string[];
	origin: CaptureOrigin;
	summaryEntryId?: string;
	confidence: number;
}): ProvenanceMetadata {
	const result: ProvenanceMetadata = {
		source: "auto",
		origin: input.origin,
		confidence: input.confidence,
		last_seen_at: new Date().toISOString(),
	};
	if (input.cwd !== undefined) result.cwd = input.cwd;
	if (input.sessionId !== undefined) result.session_id = input.sessionId;
	if (input.entryIds !== undefined) result.entry_ids = input.entryIds;
	if (input.summaryEntryId !== undefined)
		result.summary_entry_id = input.summaryEntryId;
	return result;
}

export function mergeProvenance(
	existing: ProvenanceMetadata,
	update: Partial<ProvenanceMetadata>,
): ProvenanceMetadata {
	return {
		...existing,
		...update,
		last_seen_at: new Date().toISOString(),
	};
}
