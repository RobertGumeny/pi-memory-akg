import type { MemoryStore } from "./memory-store.js";
import type { MemoryCandidate } from "./candidate-queue.js";

export type DedupAction = "new" | "update" | "duplicate";

export interface DedupResult {
	action: DedupAction;
	existingId?: string; // set when action === "update": the graph node ref to upsert/supersede
}

/** Normalize a title for identity comparison: lowercase, collapse whitespace, trim. */
function normalizeTitle(title: string): string {
	return title.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Decide whether a candidate is new, an update to an existing graph memory, or
 * a duplicate of something already pending in the queue.
 *
 * - "update": a graph node with the same `type` and normalized-equal `title`
 *   exists → returns its ref id ("type/id") so the caller upserts/supersedes
 *   rather than creating a sibling.
 * - "duplicate": an equivalent candidate already sits in the queue (same
 *   `type` + normalized `title`) → caller should skip enqueuing.
 * - "new": no match in graph or queue.
 *
 * Pure logic over store read accessors + an in-memory queue array, so it is
 * unit-testable with the existing makeFakeStore fake.
 */
export function classifyCandidate(
	candidate: MemoryCandidate,
	store: MemoryStore,
	queue: MemoryCandidate[],
): DedupResult {
	const target = normalizeTitle(candidate.title);

	// 1. Graph match → update.
	const graphNodes = store.store.listNodes(candidate.type);
	const match = graphNodes.find((n) => normalizeTitle(n.title) === target);
	if (match) {
		return { action: "update", existingId: `${match.type}/${match.id}` };
	}

	// 2. Queue match → duplicate.
	const queued = queue.some(
		(c) => c.type === candidate.type && normalizeTitle(c.title) === target,
	);
	if (queued) {
		return { action: "duplicate" };
	}

	// 3. Otherwise new.
	return { action: "new" };
}
