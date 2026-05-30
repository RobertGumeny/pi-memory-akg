import { describe, it, expect, afterEach } from "vitest";
import { handleForget } from "../../src/tools/forget.js";
import { makeTempStore, type TempStore } from "../helpers/store.js";

let ts: TempStore;
afterEach(() => ts?.cleanup());

describe("handleForget (integration)", () => {
	it("deactivate sets status to inactive", async () => {
		ts = await makeTempStore();
		ts.store.store.putNode("task", "t1", { title: "T", body: "" }, []);
		const out = await handleForget(ts.store, { id: "task/t1", mode: "deactivate" });
		expect(out).toContain("inactive");
		expect(ts.store.store.getNode("task", "t1")!.meta.status).toBe("inactive");
	});

	it("supersede sets status superseded and adds a supersedes edge to the replacement", async () => {
		ts = await makeTempStore();
		ts.store.store.putNode("decision", "old", { title: "Old", body: "" }, []);
		ts.store.store.putNode("decision", "new", { title: "New", body: "" }, []);
		await handleForget(ts.store, { id: "decision/old", mode: "supersede", supersededBy: "decision/new" });

		expect(ts.store.store.getNode("decision", "old")!.meta.status).toBe("superseded");
		const edges = ts.store.store.outboundEdges({ type: "decision", id: "new" }, "supersedes");
		expect(edges).toHaveLength(1);
		expect(edges[0]!.to).toEqual({ type: "decision", id: "old" });
	});

	it("delete removes a node with no edges", async () => {
		ts = await makeTempStore();
		ts.store.store.putNode("task", "t1", { title: "T", body: "" }, []);
		const out = await handleForget(ts.store, { id: "task/t1", mode: "delete" });
		expect(out).toContain("Deleted");
		expect(ts.store.store.getNode("task", "t1")).toBeNull();
	});

	it("refuses to delete a node with live edges and suggests cascade", async () => {
		ts = await makeTempStore();
		ts.store.store.putNode("decision", "a", { title: "A", body: "" }, []);
		ts.store.store.putNode("task", "b", { title: "B", body: "" }, []);
		ts.store.store.putEdge({ type: "decision", id: "a" }, "affects", { type: "task", id: "b" }, {});

		const out = await handleForget(ts.store, { id: "decision/a", mode: "delete" });
		expect(out).toContain("cascade: true");
		expect(ts.store.store.getNode("decision", "a")).not.toBeNull(); // not deleted

		const forced = await handleForget(ts.store, { id: "decision/a", mode: "delete", cascade: true });
		expect(forced).toContain("Deleted");
		expect(ts.store.store.getNode("decision", "a")).toBeNull();
	});

	it("returns an error for a missing node", async () => {
		ts = await makeTempStore();
		const out = await handleForget(ts.store, { id: "task/nope" });
		expect(out).toContain("not found");
	});
});
