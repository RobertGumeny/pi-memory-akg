import { describe, it, expect } from "vitest";
import { loadSettings } from "../../src/settings.js";

describe("loadSettings", () => {
	it("returns the documented defaults with no overrides", () => {
		expect(loadSettings()).toEqual({
			hintEnabled: true,
			hintBudget: 400,
			toolResultBudget: 6000,
			requireConfirmationForAll: false,
			memoryFilePath: ".pi/memory.akg",
			autoCaptureEnabled: true,
			autoCaptureSources: ["compaction", "branch"],
			headlessPolicy: "auto-commit",
			candidateQueuePath: ".pi/memory-candidates.jsonl",
			autoCommitMinConfidence: 0.7,
			dropBelowConfidence: 0.3,
			maxCandidatesPerExtraction: 10,
			liveTurnNudge: false,
		});
	});

	describe("Phase 2 auto-capture settings", () => {
		it("defaults headlessPolicy to auto-commit and honours an override", () => {
			expect(loadSettings().headlessPolicy).toBe("auto-commit");
			expect(loadSettings({ headlessPolicy: "defer" }).headlessPolicy).toBe("defer");
		});

		it("defaults autoCaptureSources and the confidence thresholds", () => {
			expect(loadSettings().autoCaptureSources).toEqual(["compaction", "branch"]);
			expect(loadSettings().autoCommitMinConfidence).toBe(0.7);
			expect(loadSettings().dropBelowConfidence).toBe(0.3);
		});

		it("does not let an override alias the shared default source array", () => {
			const a = loadSettings();
			const b = loadSettings();
			a.autoCaptureSources.push("branch");
			expect(b.autoCaptureSources).toEqual(["compaction", "branch"]);
		});
	});

	it("merges partial overrides over defaults, leaving unspecified keys intact", () => {
		const s = loadSettings({ hintBudget: 200, requireConfirmationForAll: true });
		expect(s.hintBudget).toBe(200);
		expect(s.requireConfirmationForAll).toBe(true);
		// Untouched keys retain their defaults.
		expect(s.toolResultBudget).toBe(6000);
		expect(s.memoryFilePath).toBe(".pi/memory.akg");
	});
});
