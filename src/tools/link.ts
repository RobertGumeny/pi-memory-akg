import type { MemoryStore } from "../memory-store.js";
import { RELATION_TYPES } from "../schema.js";

function parseRef(id: string): { type: string; id: string } {
	const slash = id.indexOf("/");
	if (slash < 1) return { type: id, id: "" };
	return { type: id.slice(0, slash), id: id.slice(slash + 1) };
}

export async function handleLink(
	store: MemoryStore,
	args: {
		fromId: string;
		toId: string;
		relation: string;
		strength?: number;
	},
): Promise<string> {
	const { fromId, toId, relation, strength } = args;
	const s = store.store;

	if (!(RELATION_TYPES as readonly string[]).includes(relation)) {
		return `Error: relation "${relation}" is not valid. Must be one of: ${RELATION_TYPES.join(", ")}.`;
	}

	const fromRef = parseRef(fromId);
	const fromNode = s.getNode(fromRef.type, fromRef.id);
	if (!fromNode) {
		return `Error: node '${fromId}' not found. No link created.`;
	}

	const toRef = parseRef(toId);
	const toNode = s.getNode(toRef.type, toRef.id);
	if (!toNode) {
		return `Error: node '${toId}' not found. No link created.`;
	}

	s.putEdge(fromRef, relation, toRef, { strength: strength ?? 0.5 });
	await store.commit();

	return `Linked ${fromId} -[${relation}]-> ${toId}`;
}
