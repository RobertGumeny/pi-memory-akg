import { describe, it, expect, afterEach } from "vitest";
import { runAutoCapture } from "../../src/auto-capture.js";
import { CandidateQueue } from "../../src/candidate-queue.js";
import { loadSettings } from "../../src/settings.js";
import type { LlmFn } from "../../src/extraction.js";
import { makeTempStore, type TempStore } from "../helpers/store.js";

let ts: TempStore;
afterEach(() => ts?.cleanup());

// One confident, clean candidate + one secret-like candidate (still confident).
const TWO_CANDIDATES = JSON.stringify([
	{ type: "decision", title: "Use AKG for durable memory", body: "AKG stores reusable knowledge", confidence: 0.9 },
	{ type: "constraint", title: "Keep the deploy token", body: "the token is ghp_abcd1234567890", confidence: 0.9 },
]);

const llmReturning = (json: string): LlmFn => async () => json;

const provenanceBase = { cwd: "/repo", sessionId: "s1" };

describe("runAutoCapture (integration)", () => {
	it("headless: commits the clean candidate and defers the secret-like one", async () => {
		ts = await makeTempStore();
		const queue = CandidateQueue.open(ts.dir, loadSettings());

		const report = await runAutoCapture({
			store: ts.store,
			queue,
			summaryText: "summary",
			origin: "compaction",
			provenanceBase,
			llm: llmReturning(TWO_CANDIDATES),
			settings: loadSettings(),
			hasUI: false,
		});

		expect(report.committed).toHaveLength(1);
		expect(report.deferred).toHaveLength(1);

		// Committed node lives in the graph, stamped unreviewed/auto.
		const node = ts.store.store.getNode("decision", "use-akg-for-durable-memory");
		expect(node).not.toBeNull();
		expect(node!.meta.status).toBe("unreviewed");
		expect(node!.meta.source).toBe("auto");

		// Deferred candidate is in the queue and NOT in the graph.
		expect(queue.list()).toHaveLength(1);
		expect(queue.list()[0]!.type).toBe("constraint");
		expect(ts.store.store.getNode("constraint", "keep-the-deploy-token")).toBeNull();
	});

	it("interactive: defers everything (nothing auto-commits)", async () => {
		ts = await makeTempStore();
		const queue = CandidateQueue.open(ts.dir, loadSettings());

		const report = await runAutoCapture({
			store: ts.store,
			queue,
			summaryText: "summary",
			origin: "compaction",
			provenanceBase,
			llm: llmReturning(TWO_CANDIDATES),
			settings: loadSettings(),
			hasUI: true,
		});

		expect(report.committed).toHaveLength(0);
		expect(report.deferred).toHaveLength(2);
		expect(queue.list()).toHaveLength(2);
		expect(ts.store.store.listNodes("decision")).toHaveLength(0);
	});

	it("does not create a duplicate graph node when the same extraction runs twice", async () => {
		ts = await makeTempStore();
		const queue = CandidateQueue.open(ts.dir, loadSettings());
		const common = {
			store: ts.store,
			queue,
			summaryText: "summary",
			origin: "compaction" as const,
			provenanceBase,
			llm: llmReturning(TWO_CANDIDATES),
			settings: loadSettings(),
			hasUI: false,
		};

		await runAutoCapture(common);
		const second = await runAutoCapture(common);

		// Clean candidate already in graph → update (no sibling). Secret already
		// in queue → duplicate (counted, not re-appended).
		expect(ts.store.store.listNodes("decision")).toHaveLength(1);
		expect(queue.list()).toHaveLength(1);
		expect(second.duplicates).toBe(1);
	});
});
