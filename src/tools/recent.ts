import type { MemoryStore } from "../memory-store.js";
import type { Settings } from "../settings.js";
import { fetchCandidates, formatCandidates } from "../retrieval.js";

const DEFAULT_LIMIT = 10;

export async function handleRecent(
	store: MemoryStore,
	settings: Settings,
	args: {
		limit?: number;
		types?: string[];
		tags?: string[];
		status?: string;
	},
): Promise<string> {
	const limit = args.limit ?? DEFAULT_LIMIT;

	const records = await fetchCandidates(store, {
		types: args.types,
		tags: args.tags,
		status: args.status,
		limit,
	});

	if (records.length === 0) {
		return "No recent memories found.";
	}

	const formatted = formatCandidates(records, settings.toolResultBudget);
	return `Recent memory:\n${formatted}`;
}
