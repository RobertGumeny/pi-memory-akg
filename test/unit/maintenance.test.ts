import { describe, it, expect } from "vitest";
import { getMemoryStats, findDuplicateCandidates } from "../../src/maintenance.js";
import { makeFakeStore, makeNode } from "../helpers/fake-store.js";

describe("getMemoryStats", () => {
	it("aggregates counts by type and status and lists the 5 most recent titles", async () => {
		const store = makeFakeStore({
			nodes: [
				makeNode({ type: "decision", id: "d1", title: "D1", updatedAt: 10, meta: { status: "active" } }),
				makeNode({ type: "decision", id: "d2", title: "D2", updatedAt: 60, meta: { status: "inactive" } }),
				makeNode({ type: "task", id: "t1", title: "T1", updatedAt: 50 }), // no status → active
				makeNode({ type: "task", id: "t2", title: "T2", updatedAt: 40, meta: { status: "active" } }),
				makeNode({ type: "task", id: "t3", title: "T3", updatedAt: 30, meta: { status: "active" } }),
				makeNode({ type: "task", id: "t4", title: "T4", updatedAt: 20, meta: { status: "active" } }),
			],
		});

		const stats = await getMemoryStats(store);

		expect(stats.totalNodes).toBe(6);
		expect(stats.countsByType).toEqual({ decision: 2, task: 4 });
		expect(stats.countsByStatus).toEqual({ active: 5, inactive: 1 });
		// Top 5 by updatedAt desc.
		expect(stats.recentTitles).toEqual(["D2", "T1", "T2", "T3", "T4"]);
	});

	it("handles an empty store", async () => {
		const stats = await getMemoryStats(makeFakeStore());
		expect(stats.totalNodes).toBe(0);
		expect(stats.countsByType).toEqual({});
		expect(stats.recentTitles).toEqual([]);
	});
});

describe("findDuplicateCandidates", () => {
	it("groups nodes sharing the same (type, title) and returns only groups of 2+", async () => {
		const store = makeFakeStore({
			nodes: [
				makeNode({ type: "decision", id: "a", title: "Same" }),
				makeNode({ type: "decision", id: "b", title: "Same" }),
				makeNode({ type: "decision", id: "c", title: "Unique" }),
			],
		});
		const dups = await findDuplicateCandidates(store);
		expect(dups).toHaveLength(1);
		expect(dups[0]).toMatchObject({ type: "decision", title: "Same" });
		expect(dups[0]!.nodeIds.sort()).toEqual(["decision/a", "decision/b"]);
	});

	it("does not treat the same title under different types as duplicates", async () => {
		const store = makeFakeStore({
			nodes: [
				makeNode({ type: "decision", id: "a", title: "Shared" }),
				makeNode({ type: "task", id: "b", title: "Shared" }),
			],
		});
		expect(await findDuplicateCandidates(store)).toEqual([]);
	});
});
