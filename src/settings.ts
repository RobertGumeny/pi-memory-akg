export type AutoCaptureSource = "compaction" | "branch";
export type HeadlessPolicy = "auto-commit" | "defer" | "off";

export interface Settings {
	hintEnabled: boolean;
	hintBudget: number;
	toolResultBudget: number;
	requireConfirmationForAll: boolean;
	memoryFilePath: string;
	/** Emit lifecycle/diagnostic logs to stderr. Off by default (quiet alpha). */
	debug: boolean;

	// Phase 2 — auto-capture settings (PRD §12, TASKS P2-001)
	autoCaptureEnabled: boolean;
	autoCaptureSources: AutoCaptureSource[];
	headlessPolicy: HeadlessPolicy;
	candidateQueuePath: string;
	autoCommitMinConfidence: number;
	dropBelowConfidence: number;
	maxCandidatesPerExtraction: number;
	liveTurnNudge: boolean;
}

const DEFAULTS: Settings = {
	hintEnabled: true,
	hintBudget: 400,
	toolResultBudget: 6000,
	requireConfirmationForAll: false,
	memoryFilePath: ".pi/memory.akg",
	debug: false,

	// Phase 2 defaults — auto-capture is experimental and OFF by default for alpha.
	autoCaptureEnabled: false,
	autoCaptureSources: ["compaction", "branch"],
	headlessPolicy: "auto-commit",
	candidateQueuePath: ".pi/memory-candidates.jsonl",
	autoCommitMinConfidence: 0.7,
	dropBelowConfidence: 0.3,
	maxCandidatesPerExtraction: 10,
	liveTurnNudge: false,
};

export function loadSettings(overrides?: Partial<Settings>): Settings {
	return {
		...DEFAULTS,
		...overrides,
		// Clone array defaults so overrides never alias the shared default array.
		autoCaptureSources: overrides?.autoCaptureSources
			? [...overrides.autoCaptureSources]
			: [...DEFAULTS.autoCaptureSources],
	};
}
