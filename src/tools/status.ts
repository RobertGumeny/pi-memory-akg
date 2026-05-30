import type { MemoryStore } from "../memory-store.js";
import type { Settings } from "../settings.js";
import { getMemoryStats } from "../maintenance.js";

const AVAILABLE_TOOLS = [
	"memory_remember",
	"memory_recall",
	"memory_link",
	"memory_forget",
	"memory_recent",
	"memory_inspect",
];

export async function handleStatus(
	store: MemoryStore | null,
	settings: Settings,
): Promise<string> {
	if (!store?.isOpen) {
		return [
			"Memory status: not yet active",
			"",
			"AKG memory store is not initialized for this session.",
			"Start a Pi session with this package loaded to activate memory.",
		].join("\n");
	}

	const stats = await getMemoryStats(store);

	const countsByTypeLines = Object.entries(stats.countsByType)
		.map(([t, n]) => `  ${t}: ${n}`)
		.join("\n") || "  (none)";

	const countsByStatusLines = Object.entries(stats.countsByStatus)
		.map(([s, n]) => `  ${s}: ${n}`)
		.join("\n") || "  (none)";

	const recentTitlesLines = stats.recentTitles.length > 0
		? stats.recentTitles.map((t, i) => `  ${i + 1}. ${t}`).join("\n")
		: "  (none)";

	const lines = [
		"Memory status",
		"=============",
		`Memory enabled: yes`,
		`Memory file: ${stats.filePath}`,
		``,
		`Hint: ${settings.hintEnabled ? "enabled" : "disabled"} (budget: ${settings.hintBudget} chars)`,
		`Tool result budget: ${settings.toolResultBudget} chars`,
		``,
		`Total nodes: ${stats.totalNodes}`,
		``,
		`Counts by type:`,
		countsByTypeLines,
		``,
		`Counts by status:`,
		countsByStatusLines,
		``,
		`Recent memory titles (last 5):`,
		recentTitlesLines,
		``,
		`Available tools:`,
		AVAILABLE_TOOLS.map((t) => `  ${t}`).join("\n"),
		``,
		`Recommendation: add .pi/memory.akg to .gitignore for private/local memory.`,
		``,
		`Suggested next actions:`,
		`  Run memory_recall to explore existing memories.`,
		`  Run memory_remember to store a new durable fact.`,
		`  Run memory_recent to see what was updated most recently.`,
	];

	const result = lines.join("\n");
	const budget = settings.toolResultBudget * 2;
	return result.length > budget ? result.slice(0, budget - 3) + "..." : result;
}
