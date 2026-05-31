import { describe, it, expect } from "vitest";
import { routeCandidate } from "../../src/capture-policy.js";
import type { MemoryCandidate } from "../../src/candidate-queue.js";
import { loadSettings, type Settings } from "../../src/settings.js";

function candidate(overrides: Partial<MemoryCandidate> = {}): MemoryCandidate {
	return {
		id: "c1",
		type: "decision",
		title: "Use AKG",
		body: "AKG is durable project memory",
		confidence: 0.9,
		origin: "compaction",
		provenance: { source: "auto", last_seen_at: "2026-05-30T12:00:00.000Z" },
		createdAt: "2026-05-30T12:00:00.000Z",
		...overrides,
	};
}

describe("routeCandidate", () => {
	const interactive = { hasUI: true };
	const headless = { hasUI: false };

	it("defers a high-confidence clean candidate in an interactive session", () => {
		expect(routeCandidate(candidate(), interactive, loadSettings()).action).toBe("defer");
	});

	it("auto-commits a high-confidence clean candidate headless with auto-commit policy", () => {
		const s = loadSettings({ headlessPolicy: "auto-commit" });
		expect(routeCandidate(candidate(), headless, s).action).toBe("auto-commit");
	});

	it("defers headless when headlessPolicy is defer", () => {
		const s = loadSettings({ headlessPolicy: "defer" });
		expect(routeCandidate(candidate(), headless, s).action).toBe("defer");
	});

	it("drops headless when headlessPolicy is off", () => {
		const s = loadSettings({ headlessPolicy: "off" });
		expect(routeCandidate(candidate(), headless, s).action).toBe("drop");
	});

	it("defers a secret-like candidate regardless of confidence or mode", () => {
		const secret = candidate({ body: "the token is ghp_abcd1234567890", confidence: 0.99 });
		const s: Settings = loadSettings({ headlessPolicy: "auto-commit" });
		expect(routeCandidate(secret, headless, s).action).toBe("defer");
		expect(routeCandidate(secret, interactive, s).action).toBe("defer");
	});

	it("drops a candidate below dropBelowConfidence", () => {
		const lowConf = candidate({ confidence: 0.1 });
		expect(routeCandidate(lowConf, headless, loadSettings()).action).toBe("drop");
	});

	it("defers a mid-confidence clean candidate that is above drop but below auto-commit", () => {
		const mid = candidate({ confidence: 0.5 });
		expect(routeCandidate(mid, headless, loadSettings()).action).toBe("defer");
	});
});
