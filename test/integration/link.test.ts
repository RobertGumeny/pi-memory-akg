import { describe, it, expect, afterEach } from "vitest";
import { handleLink } from "../../src/tools/link.js";
import { makeTempStore, type TempStore } from "../helpers/store.js";

let ts: TempStore;
afterEach(() => ts?.cleanup());

describe("handleLink (integration)", () => {
	it("creates an edge between two existing nodes with the default strength", async () => {
		ts = await makeTempStore();
		ts.store.store.putNode("decision", "a", { title: "A", body: "" }, []);
		ts.store.store.putNode("task", "b", { title: "B", body: "" }, []);

		const out = await handleLink(ts.store, { fromId: "decision/a", toId: "task/b", relation: "affects" });
		expect(out).toContain("-[affects]->");

		const edges = ts.store.store.outboundEdges({ type: "decision", id: "a" }, "affects");
		expect(edges).toHaveLength(1);
		expect(edges[0]!.strength).toBe(0.5);
	});

	it("rejects an invalid relation without creating an edge", async () => {
		ts = await makeTempStore();
		ts.store.store.putNode("decision", "a", { title: "A", body: "" }, []);
		ts.store.store.putNode("task", "b", { title: "B", body: "" }, []);

		const out = await handleLink(ts.store, { fromId: "decision/a", toId: "task/b", relation: "frobnicates" });
		expect(out).toContain("is not valid");
		expect(ts.store.store.outboundEdges({ type: "decision", id: "a" })).toHaveLength(0);
	});

	it("errors when an endpoint does not exist", async () => {
		ts = await makeTempStore();
		ts.store.store.putNode("decision", "a", { title: "A", body: "" }, []);
		const out = await handleLink(ts.store, { fromId: "decision/a", toId: "task/missing", relation: "affects" });
		expect(out).toContain("not found");
	});
});
