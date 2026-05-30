import type { MemoryStore } from "./memory-store.js";
import { META_STATUS } from "./schema.js";

export interface MemoryStats {
	totalNodes: number;
	countsByType: Record<string, number>;
	countsByStatus: Record<string, number>;
	recentTitles: string[];
	filePath: string;
}

export interface DuplicateCandidate {
	type: string;
	title: string;
	nodeIds: string[];
}

export async function getMemoryStats(store: MemoryStore): Promise<MemoryStats> {
	const s = store.store;
	const nodes = s.listNodes();

	const countsByType: Record<string, number> = {};
	const countsByStatus: Record<string, number> = {};

	for (const node of nodes) {
		countsByType[node.type] = (countsByType[node.type] ?? 0) + 1;
		const status = (node.meta[META_STATUS] as string | undefined) ?? "active";
		countsByStatus[status] = (countsByStatus[status] ?? 0) + 1;
	}

	const sorted = [...nodes].sort((a, b) => b.updatedAt - a.updatedAt);
	const recentTitles = sorted.slice(0, 5).map((n) => n.title);

	return {
		totalNodes: nodes.length,
		countsByType,
		countsByStatus,
		recentTitles,
		filePath: store.filePath,
	};
}

export async function runCompact(store: MemoryStore): Promise<void> {
	await store.compact();
	process.stderr.write("[akg-memory] compact() complete\n");
}

export async function findDuplicateCandidates(
	store: MemoryStore,
): Promise<DuplicateCandidate[]> {
	const nodes = store.store.listNodes();
	const groups = new Map<string, { type: string; title: string; ids: string[] }>();

	for (const node of nodes) {
		const key = `${node.type}\x00${node.title}`;
		if (!groups.has(key)) {
			groups.set(key, { type: node.type, title: node.title, ids: [] });
		}
		groups.get(key)!.ids.push(`${node.type}/${node.id}`);
	}

	const duplicates: DuplicateCandidate[] = [];
	for (const { type, title, ids } of groups.values()) {
		if (ids.length >= 2) {
			duplicates.push({ type, title, nodeIds: ids });
		}
	}

	return duplicates;
}
