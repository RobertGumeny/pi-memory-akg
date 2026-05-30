import type { MemoryStore } from "../memory-store.js";
import type { Settings } from "../settings.js";
import { formatInspect } from "../retrieval.js";

function parseRef(id: string): { type: string; id: string } {
	const slash = id.indexOf("/");
	if (slash < 1) return { type: id, id: "" };
	return { type: id.slice(0, slash), id: id.slice(slash + 1) };
}

export async function handleInspect(
	store: MemoryStore,
	settings: Settings,
	args: { id: string },
): Promise<string> {
	const s = store.store;
	const ref = parseRef(args.id);
	const node = s.getNode(ref.type, ref.id);

	if (!node) {
		return `No memory found with id '${args.id}'.`;
	}

	const outEdges = s.outboundEdges(ref);
	const inEdges = s.inboundEdges(ref);
	const edges = [...outEdges, ...inEdges];

	return formatInspect(node, edges, settings.toolResultBudget);
}
