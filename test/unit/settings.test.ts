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
			debug: false,
			autoCaptureEnabled: false,
			autoCaptureSources: ["compaction", "branch"],
			headlessPolicy: "auto-commit",
			candidateQueuePath: ".pi/memory-candidates.jsonl",
			autoCommitMinConfidence: 0.7,
			dropBelowConfidence: 0.3,
			maxCandidatesPerExtraction: 10,
			liveTurnNudge: false,
		});
	});

	it("defaults auto-capture OFF and debug OFF for the quiet alpha experience", () => {
		expect(loadSettings().autoCaptureEnabled).toBe(false);
		expect(loadSettings().debug).toBe(false);
		// Opt-in still works.
		expect(loadSettings({ autoCaptureEnabled: true }).autoCaptureEnabled).toBe(true);
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
