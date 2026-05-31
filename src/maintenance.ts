import type { MemoryStore } from "./memory-store.js";
import { META_STATUS, STATUS_UNREVIEWED } from "./schema.js";

export interface MemoryStats {
	totalNodes: number;
	countsByType: Record<string, number>;
	countsByStatus: Record<string, number>;
	recentTitles: string[];
	filePath: string;
	// Phase 2 visibility (P2-010)
	pendingCandidates: number; // sidecar queue depth
	unreviewedNodes: number; // graph nodes with status === "unreviewed"
	walGrowthHint: boolean; // store has an uncompacted WAL → suggest compaction
}

export interface DuplicateCandidate {
	type: string;
	title: string;
	nodeIds: string[];
}

// AKG rewrites the full file on every commit and only resets the WAL on
// compact(), so `hasUncompactedWAL` flips true after the first write of a
// session and stays true — useless as a "time to compact" signal. The real
// bloat proxy is the WAL record count (`nextWALSequence - 1`); hint only once it
// crosses this threshold. See docs/akg-gap-inventory.md (EXT-1, GAP-4).
const DEFAULT_WAL_COMPACTION_THRESHOLD = 2000;

export async function getMemoryStats(
	store: MemoryStore,
	opts: { pendingCandidates?: number; walThreshold?: number } = {},
): Promise<MemoryStats> {
	const s = store.store;
	const nodes = s.listNodes();

	const countsByType: Record<string, number> = {};
	const countsByStatus: Record<string, number> = {};
	let unreviewedNodes = 0;

	for (const node of nodes) {
		countsByType[node.type] = (countsByType[node.type] ?? 0) + 1;
		const status = (node.meta[META_STATUS] as string | undefined) ?? "active";
		countsByStatus[status] = (countsByStatus[status] ?? 0) + 1;
		if (status === STATUS_UNREVIEWED) unreviewedNodes += 1;
	}

	const sorted = [...nodes].sort((a, b) => b.updatedAt - a.updatedAt);
	const recentTitles = sorted.slice(0, 5).map((n) => n.title);

	// `nextWALSequence` is a real Store getter (bigint); the unit fake omits it.
	// `nextWALSequence - 1` ≈ WAL records accumulated since the last compaction.
	const threshold = opts.walThreshold ?? DEFAULT_WAL_COMPACTION_THRESHOLD;
	const nextSeq = (s as { nextWALSequence?: bigint }).nextWALSequence;
	const walRecords = typeof nextSeq === "bigint" ? Number(nextSeq - 1n) : 0;
	const walGrowthHint = walRecords > threshold;

	return {
		totalNodes: nodes.length,
		countsByType,
		countsByStatus,
		recentTitles,
		filePath: store.filePath,
		pendingCandidates: opts.pendingCandidates ?? 0,
		unreviewedNodes,
		walGrowthHint,
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
