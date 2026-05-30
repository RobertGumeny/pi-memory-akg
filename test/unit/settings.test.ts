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
