import { describe, it, expect } from "vitest";
import { classifyCandidate } from "../../src/dedup.js";
import type { MemoryCandidate } from "../../src/candidate-queue.js";
import { makeFakeStore, makeNode } from "../helpers/fake-store.js";

function candidate(overrides: Partial<MemoryCandidate> = {}): MemoryCandidate {
	return {
		id: "c1",
		type: "decision",
		title: "Use AKG for durable memory",
		body: "body",
		confidence: 0.8,
		origin: "compaction",
		provenance: { source: "auto", last_seen_at: "2026-05-30T12:00:00.000Z" },
		createdAt: "2026-05-30T12:00:00.000Z",
		...overrides,
	};
}

describe("classifyCandidate", () => {
	it("returns update with the existing id when a graph node title matches (case/space-insensitive)", () => {
		const store = makeFakeStore({
			nodes: [
				makeNode({ type: "decision", id: "use-akg", title: "use   AKG  for Durable Memory" }),
			],
		});
		const result = classifyCandidate(candidate(), store, []);
		expect(result.action).toBe("update");
		expect(result.existingId).toBe("decision/use-akg");
	});

	it("does not match a node of a different type", () => {
		const store = makeFakeStore({
			nodes: [
				makeNode({ type: "constraint", id: "x", title: "Use AKG for durable memory" }),
			],
		});
		expect(classifyCandidate(candidate(), store, []).action).toBe("new");
	});

	it("returns duplicate when an equivalent candidate already sits in the queue", () => {
		const store = makeFakeStore({});
		const queue = [candidate({ id: "queued", title: "USE AKG for durable memory" })];
		expect(classifyCandidate(candidate(), store, queue).action).toBe("duplicate");
	});

	it("returns new when nothing matches in graph or queue", () => {
		const store = makeFakeStore({});
		expect(classifyCandidate(candidate(), store, []).action).toBe("new");
	});

	it("prefers an update (graph) over a duplicate (queue) when both match", () => {
		const store = makeFakeStore({
			nodes: [makeNode({ type: "decision", id: "use-akg", title: "Use AKG for durable memory" })],
		});
		const queue = [candidate({ id: "queued" })];
		expect(classifyCandidate(candidate(), store, queue).action).toBe("update");
	});
});
