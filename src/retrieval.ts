import type { Node, Edge } from "akg-ts";
import type { MemoryStore } from "./memory-store.js";
import { META_STATUS, META_LAST_SEEN_AT } from "./schema.js";

export type MemoryRecord = Node;

export interface RecallFilters {
	types?: string[];
	tags?: string[];
	ids?: string[];
	status?: string;
	limit?: number;
	sinceMs?: number;
	neighborOf?: string;
}

export async function fetchCandidates(
	store: MemoryStore,
	filters: RecallFilters,
): Promise<MemoryRecord[]> {
	const s = store.store;
	let results: Node[] = [];

	// If specific IDs requested, fetch those directly
	if (filters.ids && filters.ids.length > 0) {
		const refs = filters.ids.map((id) => {
			const [type, ...rest] = id.split("/");
			return { type: type ?? "", id: rest.join("/") || id };
		});
		const nodes = await Promise.resolve(s.getNodes(refs));
		results = nodes.filter((n): n is Node => n !== null);
	} else if (filters.neighborOf) {
		// Graph neighborhood: get outbound + inbound edges of the given node
		const [nType, ...nRest] = filters.neighborOf.split("/");
		const nRef = { type: nType ?? "", id: nRest.join("/") || filters.neighborOf };
		const outEdges = s.outboundEdges(nRef);
		const inEdges = s.inboundEdges(nRef);
		const neighborRefs = [
			...outEdges.map((e) => e.to),
			...inEdges.map((e) => e.from),
		];
		// Deduplicate by type+id
		const seen = new Set<string>();
		const uniqueRefs = neighborRefs.filter((ref) => {
			const key = `${ref.type}/${ref.id}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
		const nodes = s.getNodes(uniqueRefs);
		results = nodes.filter((n): n is Node => n !== null);
	} else if (filters.types && filters.types.length > 0) {
		// Filter by types
		for (const type of filters.types) {
			const nodes = s.listNodesFiltered({ type });
			results.push(...nodes);
		}
	} else if (filters.tags && filters.tags.length === 1) {
		results = s.listNodesByTag(filters.tags[0]!);
	} else {
		// All nodes
		results = s.listNodes();
	}

	// Filter by tags if multiple tags specified (all must match)
	if (filters.tags && filters.tags.length > 1) {
		results = results.filter((node) =>
			filters.tags!.every((tag) => node.tags.includes(tag)),
		);
	} else if (filters.tags && filters.tags.length === 1 && !filters.ids) {
		// Already handled above for single tag + no types filter
		// But if types were also specified, we need to re-filter
		if (filters.types && filters.types.length > 0) {
			results = results.filter((node) => node.tags.includes(filters.tags![0]!));
		}
	}

	// Filter by status metadata
	if (filters.status !== undefined) {
		results = results.filter(
			(node) => (node.meta[META_STATUS] as string | undefined) === filters.status,
		);
	} else {
		// By default, exclude inactive nodes (unless status filter explicitly requests them)
		results = results.filter(
			(node) =>
				(node.meta[META_STATUS] as string | undefined) !== "inactive" &&
				(node.meta[META_STATUS] as string | undefined) !== "superseded",
		);
	}

	// Filter by recency (sinceMs = milliseconds ago)
	if (filters.sinceMs !== undefined) {
		const sinceUpdatedAt = Date.now() - filters.sinceMs;
		results = results.filter((node) => node.updatedAt >= sinceUpdatedAt);
	}

	// Sort by updatedAt descending (most recent first)
	results.sort((a, b) => b.updatedAt - a.updatedAt);

	// Apply limit
	const limit = filters.limit ?? 0;
	if (limit > 0) {
		results = results.slice(0, limit);
	}

	return results;
}

export function formatCandidates(records: MemoryRecord[], budget: number): string {
	const lines: string[] = [];
	let total = 0;

	for (const record of records) {
		const status = record.meta[META_STATUS] as string | undefined;
		const tagsStr = record.tags.length > 0 ? record.tags.join(", ") : "";
		const statusPart = status ? `, status: ${status}` : "";
		const tagsPart = tagsStr ? `, tags: ${tagsStr}` : "";
		const line = `[${record.type}] ${record.title} (id: ${record.type}/${record.id}${tagsPart}${statusPart})`;

		if (total + line.length + 1 > budget && lines.length > 0) {
			break;
		}
		lines.push(line);
		total += line.length + 1; // +1 for newline
	}

	return lines.join("\n");
}

export function formatInspect(record: MemoryRecord, edges: Edge[], budget: number): string {
	const status = record.meta[META_STATUS] as string | undefined;
	const lastSeenAt = record.meta[META_LAST_SEEN_AT] as string | undefined;

	const header = [
		`type: ${record.type}`,
		`id: ${record.type}/${record.id}`,
		`title: ${record.title}`,
		`tags: ${record.tags.join(", ") || "(none)"}`,
		`status: ${status ?? "active"}`,
		`created: ${new Date(record.createdAt).toISOString()}`,
		`updated: ${new Date(record.updatedAt).toISOString()}`,
		lastSeenAt ? `last_seen_at: ${lastSeenAt}` : null,
	]
		.filter(Boolean)
		.join("\n");

	const edgeLines =
		edges.length > 0
			? "\nedges:\n" +
				edges
					.map(
						(e) =>
							`  ${e.from.type}/${e.from.id} -[${e.relation}]-> ${e.to.type}/${e.to.id} (strength: ${e.strength})`,
					)
					.join("\n")
			: "\nedges: (none)";

	const metaEntries = Object.entries(record.meta)
		.filter(([k]) => k !== META_STATUS && k !== META_LAST_SEEN_AT)
		.map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`)
		.join("\n");
	const metaSection = metaEntries ? `\nmeta:\n${metaEntries}` : "";

	// Build body section, truncating deterministically (not mid-word) if needed
	const prefix = `${header}${metaSection}${edgeLines}\nbody:\n`;
	const remaining = budget - prefix.length;

	let body = record.body ?? "";
	if (remaining <= 0) {
		// No budget left for body
		body = "";
	} else if (body.length > remaining) {
		// Truncate at word boundary
		const truncated = body.slice(0, remaining - 3);
		const lastSpace = truncated.lastIndexOf(" ");
		body = (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + "...";
	}

	return prefix + body;
}
