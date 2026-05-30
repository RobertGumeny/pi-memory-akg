import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	fetchCandidates,
	formatCandidates,
	formatInspect,
} from "../../src/retrieval.js";
import { makeFakeStore, makeNode, makeEdge } from "../helpers/fake-store.js";

describe("fetchCandidates", () => {
	describe("route selection", () => {
		it("fetches by explicit ids", async () => {
			const store = makeFakeStore({
				nodes: [
					makeNode({ type: "decision", id: "d1" }),
					makeNode({ type: "constraint", id: "c1" }),
					makeNode({ type: "decision", id: "d2" }),
				],
			});
			const out = await fetchCandidates(store, { ids: ["decision/d1", "constraint/c1"] });
			expect(out.map((n) => `${n.type}/${n.id}`).sort()).toEqual(["constraint/c1", "decision/d1"]);
		});

		it("fetches by type", async () => {
			const store = makeFakeStore({
				nodes: [
					makeNode({ type: "decision", id: "d1" }),
					makeNode({ type: "decision", id: "d2" }),
					makeNode({ type: "constraint", id: "c1" }),
				],
			});
			const out = await fetchCandidates(store, { types: ["decision"] });
			expect(out).toHaveLength(2);
		});

		it("fetches by a single tag via the fast path", async () => {
			const store = makeFakeStore({
				nodes: [
					makeNode({ type: "decision", id: "d1", tags: ["durable"] }),
					makeNode({ type: "decision", id: "d2", tags: ["workflow"] }),
				],
			});
			const out = await fetchCandidates(store, { tags: ["durable"] });
			expect(out.map((n) => n.id)).toEqual(["d1"]);
		});

		it("falls back to all nodes when no filter narrows the route", async () => {
			const store = makeFakeStore({
				nodes: [makeNode({ type: "decision", id: "d1" }), makeNode({ type: "task", id: "t1" })],
			});
			expect(await fetchCandidates(store, {})).toHaveLength(2);
		});

		it("returns neighbors (inbound + outbound), deduplicated", async () => {
			const store = makeFakeStore({
				nodes: [
					makeNode({ type: "decision", id: "d1" }),
					makeNode({ type: "task", id: "t1" }),
					makeNode({ type: "task", id: "t2" }),
				],
				edges: [
					makeEdge({ from: { type: "decision", id: "d1" }, relation: "affects", to: { type: "task", id: "t1" } }),
					makeEdge({ from: { type: "task", id: "t2" }, relation: "blocks", to: { type: "decision", id: "d1" } }),
					// Duplicate neighbor via a second edge to t1 — must dedupe.
					makeEdge({ from: { type: "decision", id: "d1" }, relation: "documents", to: { type: "task", id: "t1" } }),
				],
			});
			const out = await fetchCandidates(store, { neighborOf: "decision/d1" });
			expect(out.map((n) => n.id).sort()).toEqual(["t1", "t2"]);
		});
	});

	describe("tag filtering", () => {
		it("requires all tags to match when multiple tags are given (intersection)", async () => {
			const store = makeFakeStore({
				nodes: [
					makeNode({ type: "decision", id: "both", tags: ["a", "b"] }),
					makeNode({ type: "decision", id: "onlyA", tags: ["a"] }),
					makeNode({ type: "decision", id: "neither", tags: ["c"] }),
				],
			});
			const out = await fetchCandidates(store, { tags: ["a", "b"] });
			expect(out.map((n) => n.id)).toEqual(["both"]);
		});
	});

	describe("status filtering", () => {
		const nodes = [
			makeNode({ type: "task", id: "active", meta: { status: "active" } }),
			makeNode({ type: "task", id: "nostatus" }),
			makeNode({ type: "task", id: "inactive", meta: { status: "inactive" } }),
			makeNode({ type: "task", id: "superseded", meta: { status: "superseded" } }),
		];

		it("excludes inactive and superseded by default", async () => {
			const out = await fetchCandidates(makeFakeStore({ nodes }), {});
			expect(out.map((n) => n.id).sort()).toEqual(["active", "nostatus"]);
		});

		it("returns exactly the requested status when one is given", async () => {
			const out = await fetchCandidates(makeFakeStore({ nodes }), { status: "inactive" });
			expect(out.map((n) => n.id)).toEqual(["inactive"]);
		});
	});

	describe("recency, sort, and limit", () => {
		const now = new Date("2026-05-30T12:00:00.000Z").getTime();

		beforeEach(() => {
			vi.useFakeTimers();
			vi.setSystemTime(now);
		});
		afterEach(() => vi.useRealTimers());

		it("keeps only nodes updated within sinceMs", async () => {
			const store = makeFakeStore({
				nodes: [
					makeNode({ type: "task", id: "fresh", updatedAt: now - 1_000 }),
					makeNode({ type: "task", id: "stale", updatedAt: now - 10_000 }),
				],
			});
			const out = await fetchCandidates(store, { sinceMs: 5_000 });
			expect(out.map((n) => n.id)).toEqual(["fresh"]);
		});

		it("sorts by updatedAt descending", async () => {
			const store = makeFakeStore({
				nodes: [
					makeNode({ type: "task", id: "old", updatedAt: 100 }),
					makeNode({ type: "task", id: "new", updatedAt: 300 }),
					makeNode({ type: "task", id: "mid", updatedAt: 200 }),
				],
			});
			const out = await fetchCandidates(store, {});
			expect(out.map((n) => n.id)).toEqual(["new", "mid", "old"]);
		});

		it("applies a positive limit", async () => {
			const store = makeFakeStore({
				nodes: [
					makeNode({ type: "task", id: "a", updatedAt: 3 }),
					makeNode({ type: "task", id: "b", updatedAt: 2 }),
					makeNode({ type: "task", id: "c", updatedAt: 1 }),
				],
			});
			expect(await fetchCandidates(store, { limit: 2 })).toHaveLength(2);
		});

		it("treats limit 0 / unset as unlimited", async () => {
			const store = makeFakeStore({
				nodes: [makeNode({ type: "task", id: "a" }), makeNode({ type: "task", id: "b" })],
			});
			expect(await fetchCandidates(store, { limit: 0 })).toHaveLength(2);
			expect(await fetchCandidates(store, {})).toHaveLength(2);
		});
	});
});

describe("formatCandidates", () => {
	const records = [
		makeNode({ type: "decision", id: "d1", title: "First", tags: ["durable"], meta: { status: "active" } }),
		makeNode({ type: "decision", id: "d2", title: "Second" }),
		makeNode({ type: "decision", id: "d3", title: "Third" }),
	];

	it("renders type, title, id, tags and status", () => {
		const out = formatCandidates([records[0]!], 10_000);
		expect(out).toBe("[decision] First (id: decision/d1, tags: durable, status: active)");
	});

	it("stops adding lines once the budget would be exceeded", () => {
		const out = formatCandidates(records, 80);
		expect(out.split("\n").length).toBeLessThan(records.length);
		expect(out.length).toBeLessThanOrEqual(80);
	});

	it("always emits at least one line even if it alone exceeds the budget", () => {
		const out = formatCandidates(records, 5);
		expect(out.split("\n")).toHaveLength(1);
		expect(out).toContain("First");
	});
});

describe("formatInspect", () => {
	const record = makeNode({
		type: "decision",
		id: "d1",
		title: "A decision",
		body: "alpha beta gamma delta epsilon zeta eta theta",
		tags: ["durable"],
		createdAt: 0,
		updatedAt: 0,
		meta: { status: "active", last_seen_at: "2026-01-01T00:00:00.000Z", source: "manual" },
	});

	it("renders header, status and (none) for edges when there are none", () => {
		const out = formatInspect(record, [], 10_000);
		expect(out).toContain("type: decision");
		expect(out).toContain("status: active");
		expect(out).toContain("edges: (none)");
	});

	it("renders edges when present", () => {
		const edge = makeEdge({ from: { type: "decision", id: "d1" }, relation: "affects", to: { type: "task", id: "t1" }, strength: 0.5 });
		const out = formatInspect(record, [edge], 10_000);
		expect(out).toContain("decision/d1 -[affects]-> task/t1");
	});

	it("excludes status and last_seen_at from the meta section but keeps other keys", () => {
		const out = formatInspect(record, [], 10_000);
		expect(out).toContain("source");
		// last_seen_at appears in the header, not the meta block; status never in meta.
		expect(out).not.toMatch(/meta:[\s\S]*\bstatus\b/);
	});

	it("truncates the body at a word boundary with an ellipsis when over budget", () => {
		const prefix = formatInspect({ ...record, body: "" }, [], 10_000);
		const budget = prefix.length + 12; // room for a few body chars only
		const out = formatInspect(record, [], budget);

		expect(out.length).toBeLessThanOrEqual(budget);
		expect(out.startsWith(prefix)).toBe(true);
		expect(out.endsWith("...")).toBe(true);

		// The retained body text is a whole-word prefix of the original body:
		// it appears verbatim at the start and ends exactly at a space boundary.
		const core = out.slice(prefix.length, -"...".length);
		expect(record.body.startsWith(core)).toBe(true);
		expect(core.length === record.body.length || record.body[core.length] === " ").toBe(true);
	});

	it("drops the body entirely when there is no budget left for it", () => {
		const prefixLen = formatInspect({ ...record, body: "" }, [], 10_000).length;
		const out = formatInspect(record, [], prefixLen); // remaining == 0
		expect(out.endsWith("body:\n")).toBe(true);
	});
});
