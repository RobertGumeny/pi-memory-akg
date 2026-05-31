import { describe, it, expect, afterEach } from "vitest";
import { findUnreviewed, handleRevert } from "../../src/tools/revert.js";
import { fetchCandidates } from "../../src/retrieval.js";
import { makeTempStore, type TempStore } from "../helpers/store.js";

let ts: TempStore;
afterEach(() => ts?.cleanup());

async function seed(ts: TempStore): Promise<void> {
	const s = ts.store.store;
	s.putNode("decision", "auto-one", {
		title: "Auto one",
		body: "b",
		meta: { status: "unreviewed", source: "auto", origin: "compaction", last_seen_at: "x" },
	}, []);
	s.putNode("decision", "auto-two", {
		title: "Auto two",
		body: "b",
		meta: { status: "unreviewed", source: "auto", origin: "compaction", last_seen_at: "x" },
	}, []);
	s.putNode("decision", "reviewed", {
		title: "Reviewed",
		body: "b",
		meta: { status: "active", source: "manual", last_seen_at: "x" },
	}, []);
	await ts.store.commit();
}

describe("revert surface (integration)", () => {
	it("dry-run reports exactly the unreviewed auto nodes", async () => {
		ts = await makeTempStore();
		await seed(ts);

		expect(findUnreviewed(ts.store)).toHaveLength(2);
		const dry = await handleRevert(ts.store, {});
		expect(dry).toContain("Dry run: 2");
		expect(dry).toContain("auto-one");
		expect(dry).toContain("auto-two");
		expect(dry).not.toContain("decision/reviewed");
		// Dry run mutates nothing.
		expect(findUnreviewed(ts.store)).toHaveLength(2);
	});

	it("confirm:true with default mode deactivates exactly the unreviewed, leaving the active node", async () => {
		ts = await makeTempStore();
		await seed(ts);

		await handleRevert(ts.store, { confirm: true });

		// The two reverted nodes are now inactive → absent from default recall.
		const recalled = await fetchCandidates(ts.store, { types: ["decision"] });
		const ids = recalled.map((n) => n.id);
		expect(ids).toEqual(["reviewed"]);

		// They still exist in the graph, just deactivated.
		expect(ts.store.store.getNode("decision", "auto-one")!.meta.status).toBe("inactive");
		expect(findUnreviewed(ts.store)).toHaveLength(0);
	});

	it("mode:delete removes the unreviewed nodes from the graph", async () => {
		ts = await makeTempStore();
		await seed(ts);

		await handleRevert(ts.store, { mode: "delete", confirm: true });

		expect(ts.store.store.getNode("decision", "auto-one")).toBeNull();
		expect(ts.store.store.getNode("decision", "auto-two")).toBeNull();
		expect(ts.store.store.getNode("decision", "reviewed")).not.toBeNull();
	});

	it("reports nothing to revert when there are no unreviewed auto nodes", async () => {
		ts = await makeTempStore();
		const out = await handleRevert(ts.store, {});
		expect(out).toMatch(/Nothing to revert/);
	});
});
