import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { extractCandidates, type LlmFn } from "../../src/extraction.js";
import { loadSettings } from "../../src/settings.js";

const NOW_ISO = "2026-05-30T12:00:00.000Z";

const fakeLlm = (response: string): LlmFn => async () => response;

const baseInput = {
	summaryText: "We decided X and constrained Y.",
	origin: "compaction" as const,
	provenanceBase: { cwd: "/repo", sessionId: "s1" },
};

describe("extractCandidates", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(NOW_ISO));
	});
	afterEach(() => vi.useRealTimers());

	it("keeps only valid items and stamps auto provenance", async () => {
		const llm = fakeLlm(
			JSON.stringify([
				{ type: "decision", title: "Use AKG", body: "durable memory", confidence: 0.9 },
				{ type: "not-a-type", title: "Bad", body: "x", confidence: 0.9 },
				{ type: "constraint", title: "No vectors", body: "no vector search", confidence: 0.6 },
			]),
		);
		const out = await extractCandidates(baseInput, llm, loadSettings());
		expect(out).toHaveLength(2);
		expect(out.map((c) => c.type)).toEqual(["decision", "constraint"]);
		for (const c of out) {
			expect(c.provenance.source).toBe("auto");
			expect(c.provenance.origin).toBe("compaction");
			expect(c.origin).toBe("compaction");
			expect(c.createdAt).toBe(NOW_ISO);
			expect(typeof c.id).toBe("string");
		}
	});

	it("drops items with empty title/body or out-of-range confidence", async () => {
		const llm = fakeLlm(
			JSON.stringify([
				{ type: "decision", title: "", body: "x", confidence: 0.9 },
				{ type: "decision", title: "Ok", body: "  ", confidence: 0.9 },
				{ type: "decision", title: "Ok", body: "y", confidence: 1.5 },
				{ type: "decision", title: "Ok", body: "y", confidence: "high" },
			]),
		);
		expect(await extractCandidates(baseInput, llm, loadSettings())).toEqual([]);
	});

	it("returns [] on malformed JSON instead of throwing", async () => {
		expect(await extractCandidates(baseInput, fakeLlm("not json at all"), loadSettings())).toEqual([]);
	});

	it("tolerates code-fenced JSON", async () => {
		const llm = fakeLlm(
			'```json\n[{"type":"task","title":"Ship it","body":"do the thing","confidence":0.8}]\n```',
		);
		const out = await extractCandidates(baseInput, llm, loadSettings());
		expect(out).toHaveLength(1);
		expect(out[0]!.type).toBe("task");
	});

	it("caps output to maxCandidatesPerExtraction", async () => {
		const fifty = Array.from({ length: 50 }, (_, i) => ({
			type: "decision",
			title: `Decision ${i}`,
			body: "body",
			confidence: 0.8,
		}));
		const out = await extractCandidates(baseInput, fakeLlm(JSON.stringify(fifty)), loadSettings());
		expect(out).toHaveLength(loadSettings().maxCandidatesPerExtraction);
	});

	it("returns [] when the LLM call rejects", async () => {
		const llm: LlmFn = async () => {
			throw new Error("model unavailable");
		};
		expect(await extractCandidates(baseInput, llm, loadSettings())).toEqual([]);
	});
});
