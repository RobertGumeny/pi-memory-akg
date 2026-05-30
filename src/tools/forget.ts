import type { MemoryStore } from "../memory-store.js";
import { META_STATUS } from "../schema.js";

function parseRef(id: string): { type: string; id: string } {
	const slash = id.indexOf("/");
	if (slash < 1) return { type: id, id: "" };
	return { type: id.slice(0, slash), id: id.slice(slash + 1) };
}

export async function handleForget(
	store: MemoryStore,
	args: {
		id: string;
		mode?: "deactivate" | "supersede" | "delete";
		supersededBy?: string;
		cascade?: boolean;
	},
): Promise<string> {
	const { id, mode = "deactivate", cascade = false } = args;
	const s = store.store;
	const ref = parseRef(id);

	const node = s.getNode(ref.type, ref.id);
	if (!node) {
		return `Error: node '${id}' not found.`;
	}

	if (mode === "deactivate") {
		s.putNode(
			node.type,
			node.id,
			{ title: node.title, body: node.body, meta: { ...node.meta, [META_STATUS]: "inactive" } },
			node.tags,
		);
		await store.commit();
		return `Forgot ${id} (status: inactive)`;
	}

	if (mode === "supersede") {
		s.putNode(
			node.type,
			node.id,
			{ title: node.title, body: node.body, meta: { ...node.meta, [META_STATUS]: "superseded" } },
			node.tags,
		);

		if (args.supersededBy) {
			const byRef = parseRef(args.supersededBy);
			const byNode = s.getNode(byRef.type, byRef.id);
			if (byNode) {
				s.putEdge(byRef, "supersedes", ref, {});
			}
		}

		await store.commit();
		return `Forgot ${id} (status: superseded)`;
	}

	// mode === "delete"
	if (cascade) {
		s.deleteNodeCascade(ref.type, ref.id);
		await store.commit();
		return `Deleted ${id}`;
	}

	try {
		s.deleteNode(ref.type, ref.id);
		await store.commit();
		return `Deleted ${id}`;
	} catch {
		return `Cannot delete ${id}: node has live edges. Use cascade: true to force deletion or deactivate instead.`;
	}
}
