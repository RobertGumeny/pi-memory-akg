export interface ProvenanceMetadata {
	cwd?: string;
	session_id?: string;
	entry_ids?: string[];
	source?: string;
	last_seen_at: string;
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
