import { describe, it, expect, afterEach } from "vitest";
import { accept, reject, listPending, handleReview } from "../../src/tools/review.js";
import { CandidateQueue, type MemoryCandidate } from "../../src/candidate-queue.js";
import { loadSettings } from "../../src/settings.js";
import { makeTempStore, type TempStore } from "../helpers/store.js";

let ts: TempStore;
afterEach(() => ts?.cleanup());

function candidate(id: string, title: string): MemoryCandidate {
	return {
		id,
		type: "decision",
		title,
		body: `body for ${title}`,
		confidence: 0.8,
		origin: "compaction",
		provenance: { source: "auto", origin: "compaction", confidence: 0.8, last_seen_at: "2026-05-30T12:00:00.000Z" },
		createdAt: "2026-05-30T12:00:00.000Z",
	};
}

describe("review surface (integration)", () => {
	it("accepts the first candidate (active node) and rejects the second", async () => {
		ts = await makeTempStore();
		const queue = CandidateQueue.open(ts.dir, loadSettings());
		queue.append(candidate("c1", "First decision"));
		queue.append(candidate("c2", "Second decision"));

		await accept(queue, ts.store, "c1");
		const node = ts.store.store.getNode("decision", "first-decision");
		expect(node).not.toBeNull();
		expect(node!.meta.status).toBe("active");
		expect(listPending(queue)).toHaveLength(1);

		await reject(queue, "c2");
		expect(listPending(queue)).toHaveLength(0);
		expect(ts.store.store.getNode("decision", "second-decision")).toBeNull();
	});

	it("writes edited title/body when accepting with edits", async () => {
		ts = await makeTempStore();
		const queue = CandidateQueue.open(ts.dir, loadSettings());
		queue.append(candidate("c1", "Original title"));

		await accept(queue, ts.store, "c1", { title: "Edited title", body: "edited body" });

		expect(ts.store.store.getNode("decision", "original-title")).toBeNull();
		const node = ts.store.store.getNode("decision", "edited-title");
		expect(node).not.toBeNull();
		expect(node!.title).toBe("Edited title");
		expect(node!.body).toBe("edited body");
	});

	it("handleReview list returns a bounded summary of pending candidates", async () => {
		ts = await makeTempStore();
		const settings = loadSettings();
		const queue = CandidateQueue.open(ts.dir, settings);
		queue.append(candidate("c1", "First"));
		queue.append(candidate("c2", "Second"));

		const out = await handleReview(queue, ts.store, settings, { action: "list" });
		expect(out).toContain("Pending memory candidates:");
		expect(out).toContain("c1");
		expect(out).toContain("c2");
		expect(out.length).toBeLessThanOrEqual(settings.toolResultBudget);
	});

	it("returns a clear message when accepting an unknown id and writes nothing", async () => {
		ts = await makeTempStore();
		const queue = CandidateQueue.open(ts.dir, loadSettings());
		const out = await accept(queue, ts.store, "missing");
		expect(out).toMatch(/No pending candidate/);
		expect(ts.store.store.listNodes()).toHaveLength(0);
	});
});
