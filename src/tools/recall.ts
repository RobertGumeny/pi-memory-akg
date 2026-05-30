import type { MemoryStore } from "../memory-store.js";
import type { Settings } from "../settings.js";
import { fetchCandidates, formatCandidates } from "../retrieval.js";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export async function handleRecall(
	store: MemoryStore,
	settings: Settings,
	args: {
		types?: string[];
		tags?: string[];
		ids?: string[];
		limit?: number;
		neighborOf?: string;
		status?: string;
	},
): Promise<string> {
	const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

	const records = await fetchCandidates(store, {
		types: args.types,
		tags: args.tags,
		ids: args.ids,
		status: args.status,
		limit,
		neighborOf: args.neighborOf,
	});

	if (records.length === 0) {
		return "No matching memories found.";
	}

	const formatted = formatCandidates(records, settings.toolResultBudget);
	return `Relevant memory:\n${formatted}`;
}
