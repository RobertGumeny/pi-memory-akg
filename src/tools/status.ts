import type { MemoryStore } from "../memory-store.js";
import type { Settings } from "../settings.js";
import { getMemoryStats } from "../maintenance.js";

export async function handleStatus(
	store: MemoryStore | null,
	settings: Settings,
	pendingCandidates = 0,
): Promise<string> {
	if (!store?.isOpen) {
		return [
			"AKG memory: not active",
			"",
			"The memory store is not initialized for this session.",
			"Start a Pi session with this package loaded to activate memory.",
		].join("\n");
	}

	const stats = await getMemoryStats(store, { pendingCandidates });
	const st = stats.countsByStatus;

	const typesLine =
		Object.entries(stats.countsByType)
			.map(([t, n]) => `${n} ${t}${n === 1 ? "" : "s"}`)
			.join(", ") || "none yet";

	const recentLines =
		stats.recentRefs.length > 0
			? stats.recentRefs.map((r) => `- ${r}`).join("\n")
			: "- (none yet)";

	const lines = [
		`AKG memory: enabled`,
		`File: ${stats.filePath}`,
		`Hint: ${settings.hintEnabled ? `enabled, ${settings.hintBudget} chars` : "disabled"}`,
		`Auto-capture: ${settings.autoCaptureEnabled ? "enabled" : "disabled (experimental)"}`,
		``,
		`Records: ${st.active ?? 0} active, ${st.unreviewed ?? 0} unreviewed, ${st.inactive ?? 0} inactive`,
		`Types: ${typesLine}`,
		// The pending review queue only exists when auto-capture is enabled.
		...(settings.autoCaptureEnabled
			? [`Pending queue: ${stats.pendingCandidates} candidate(s)`]
			: []),
		...(stats.walGrowthHint
			? [`Maintenance: uncompacted WAL is large — run /memory-cleanup.`]
			: []),
		``,
		`Recent:`,
		recentLines,
		``,
		`Next actions:`,
		`- Ask me to remember durable project decisions.`,
		`- Run /memory-cleanup if memory feels stale or duplicated.`,
		...(settings.autoCaptureEnabled && stats.pendingCandidates > 0
			? ["- Run /memory-review to triage pending candidates."]
			: []),
	];

	const result = lines.join("\n");
	const budget = settings.toolResultBudget * 2;
	return result.length > budget ? result.slice(0, budget - 3) + "..." : result;
}
