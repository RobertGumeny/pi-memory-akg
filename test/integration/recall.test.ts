import { describe, it, expect, afterEach } from "vitest";
import { handleRecall } from "../../src/tools/recall.js";
import { loadSettings } from "../../src/settings.js";
import { makeTempStore, type TempStore } from "../helpers/store.js";

let ts: TempStore;
afterEach(() => ts?.cleanup());

async function seed(ts: TempStore, n: number) {
	for (let i = 0; i < n; i++) {
		ts.store.store.putNode("decision", `d${i}`, { title: `Decision ${i}`, body: "" }, ["durable"]);
	}
	ts.store.store.putNode("task", "t1", { title: "A task", body: "" }, []);
	await ts.store.commit();
}

describe("handleRecall (integration)", () => {
	it("returns matching nodes filtered by type", async () => {
		ts = await makeTempStore();
		await seed(ts, 2);
		const out = await handleRecall(ts.store, loadSettings(), { types: ["task"] });
		expect(out).toContain("A task");
		expect(out).not.toContain("Decision 0");
	});

	it("reports when nothing matches", async () => {
		ts = await makeTempStore();
		const out = await handleRecall(ts.store, loadSettings(), { types: ["concept"] });
		expect(out).toBe("No matching memories found.");
	});

	it("clamps to the default limit of 10 when none is given", async () => {
		ts = await makeTempStore();
		await seed(ts, 12); // 12 decisions + 1 task
		const out = await handleRecall(ts.store, loadSettings(), {});
		expect(out.split("\n").filter((l) => l.startsWith("[")).length).toBe(10);
	});

	it("excludes deactivated nodes from the default recall", async () => {
		ts = await makeTempStore();
		ts.store.store.putNode("decision", "live", { title: "Live", body: "" }, []);
		ts.store.store.putNode("decision", "dead", { title: "Dead", body: "", meta: { status: "inactive" } }, []);
		await ts.store.commit();
		const out = await handleRecall(ts.store, loadSettings(), { types: ["decision"] });
		expect(out).toContain("Live");
		expect(out).not.toContain("Dead");
	});
});
