import type { Node, Edge, NodeRef, NodeFilter } from "akg-ts";
import type { MemoryStore } from "../../src/memory-store.js";

/**
 * In-memory test doubles for unit tests. These never touch the filesystem or
 * akg-ts — they implement only the read accessors that the pure business-logic
 * functions (fetchCandidates, getMemoryStats, ...) actually call.
 */

export function makeNode(
	partial: Partial<Node> & { type: string; id: string },
): Node {
	return {
		type: partial.type,
		id: partial.id,
		title: partial.title ?? partial.id,
		body: partial.body ?? "",
		meta: partial.meta ?? {},
		tags: partial.tags ?? [],
		createdAt: partial.createdAt ?? 0,
		updatedAt: partial.updatedAt ?? 0,
		version: partial.version ?? 1,
	};
}

export function makeEdge(
	partial: Partial<Edge> & { from: NodeRef; relation: string; to: NodeRef },
): Edge {
	return {
		from: partial.from,
		relation: partial.relation,
		to: partial.to,
		strength: partial.strength ?? 0.5,
		confidence: partial.confidence ?? null,
		meta: partial.meta ?? {},
		createdAt: partial.createdAt ?? 0,
		updatedAt: partial.updatedAt ?? 0,
		version: partial.version ?? 1,
	};
}

export interface FakeStoreData {
	nodes?: Node[];
	edges?: Edge[];
}

/**
 * Build a fake MemoryStore whose `.store` implements the akg-ts read accessors
 * over a fixed set of nodes/edges. Returned typed as MemoryStore so it drops
 * straight into fetchCandidates/getMemoryStats/etc.
 */
export function makeFakeStore(data: FakeStoreData = {}): MemoryStore {
	const nodes = data.nodes ?? [];
	const edges = data.edges ?? [];
	const find = (type: string, id: string): Node | null =>
		nodes.find((n) => n.type === type && n.id === id) ?? null;
	const matches = (ref: NodeRef, target: NodeRef): boolean =>
		ref.type === target.type && ref.id === target.id;

	const store = {
		listNodes: (typeName?: string): Node[] =>
			typeName ? nodes.filter((n) => n.type === typeName) : [...nodes],
		listNodesByTag: (tag: string): Node[] =>
			nodes.filter((n) => n.tags.includes(tag)),
		listNodesFiltered: (filter: NodeFilter): Node[] =>
			nodes.filter(
				(n) =>
					(filter.type === undefined || n.type === filter.type) &&
					(filter.tag === undefined || n.tags.includes(filter.tag)),
			),
		getNode: (type: string, id: string): Node | null => find(type, id),
		getNodes: (refs: NodeRef[]): Array<Node | null> =>
			refs.map((r) => find(r.type, r.id)),
		outboundEdges: (ref: NodeRef, relation?: string): Edge[] =>
			edges.filter(
				(e) =>
					matches(ref, e.from) &&
					(relation === undefined || e.relation === relation),
			),
		inboundEdges: (ref: NodeRef, relation?: string): Edge[] =>
			edges.filter(
				(e) =>
					matches(ref, e.to) &&
					(relation === undefined || e.relation === relation),
			),
	};

	return { store } as unknown as MemoryStore;
}
