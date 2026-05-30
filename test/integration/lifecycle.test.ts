import { describe, it, expect, afterEach } from "vitest";
import { handleRemember } from "../../src/tools/remember.js";
import { MemoryStore } from "../../src/memory-store.js";
import { loadSettings } from "../../src/settings.js";
import { makeTempStore, type TempStore } from "../helpers/store.js";

let ts: TempStore;
afterEach(() => ts?.cleanup());

describe("store lifecycle (integration)", () => {
	it("persists a remembered node across close and reopen", async () => {
		ts = await makeTempStore();
		const settings = loadSettings();
		await handleRemember(ts.store, settings, { type: "decision", title: "Persisted", body: "survives reopen" });
		await ts.store.close();

		// Reopen the same directory and confirm the node is still there.
		const reopened = await MemoryStore.open(ts.dir, settings);
		try {
			const node = reopened.store.getNode("decision", "persisted");
			expect(node).not.toBeNull();
			expect(node!.body).toBe("survives reopen");
		} finally {
			await reopened.close();
		}
	});

	it("wraps open failures on a non-writable path", async () => {
		await expect(
			MemoryStore.open("/proc/1", loadSettings({ memoryFilePath: "mem/memory.akg" })),
		).rejects.toThrow(/Cannot open memory file/);
	});
});
