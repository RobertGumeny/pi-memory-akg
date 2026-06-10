import { describe, it, expect, afterEach } from "vitest";
import { handleRemember } from "../../src/tools/remember.js";
import { loadSettings } from "../../src/settings.js";
import { makeTempStore, type TempStore } from "../helpers/store.js";

let ts: TempStore;
afterEach(() => ts?.cleanup());

describe("handleRemember (integration)", () => {
	it("writes a retrievable node with a slug derived from the title and provenance meta", async () => {
		ts = await makeTempStore();
		const out = await handleRemember(
			ts.store,
			loadSettings(),
			{ type: "decision", title: "Use AKG Now", body: "because it is durable" },
			{ cwd: "/repo", source: "manual" },
		);

		expect(out).toContain("ref: decision/use-akg-now");
		const node = ts.store.store.getNode("decision", "use-akg-now");
		expect(node).not.toBeNull();
		expect(node!.title).toBe("Use AKG Now");
		expect(node!.meta.cwd).toBe("/repo");
		expect(node!.meta.last_seen_at).toBeTypeOf("string");
	});

	it("requires confirmation before writing when the policy demands it, and writes nothing", async () => {
		ts = await makeTempStore({ requireConfirmationForAll: true });
		const out = await handleRemember(
			ts.store,
			loadSettings({ requireConfirmationForAll: true }),
			{ type: "decision", title: "Needs ok", body: "x" },
			undefined,
			true,
		);

		expect(out).toContain("Confirmation required");
		expect(ts.store.store.getNode("decision", "needs-ok")).toBeNull();
	});

	it("writes when confirm: true is passed", async () => {
		ts = await makeTempStore({ requireConfirmationForAll: true });
		await handleRemember(
			ts.store,
			loadSettings({ requireConfirmationForAll: true }),
			{ type: "decision", title: "Confirmed", body: "x", confirm: true },
			undefined,
			true,
		);
		expect(ts.store.store.getNode("decision", "confirmed")).not.toBeNull();
	});

	it("normalizes hyphenated/uppercase tags so they don't throw `invalid component` (dogfood regression)", async () => {
		// Repro of the 2026-06-09 dogfood failure: a model tagged a memory with the
		// repo name `tiny-notes`; hyphenated tags hit akg-ts validateTag and threw.
		ts = await makeTempStore();
		const out = await handleRemember(
			ts.store,
			loadSettings(),
			{
				type: "decision",
				title: "Store notes in local JSON file",
				body: "tiny-notes uses a local JSON file instead of SQLite",
				tags: ["durable", "storage", "tiny-notes", "Auto-Capture"],
			},
			{ cwd: "/repo", source: "manual" },
		);

		expect(out).toContain("ref: decision/");
		const node = ts.store.store.getNode("decision", "store-notes-in-local-json-file");
		expect(node).not.toBeNull();
		// Hyphens/capitals normalized to valid components; order/dedupe preserved.
		expect(new Set(node!.tags)).toEqual(
			new Set(["durable", "storage", "tiny_notes", "auto_capture"]),
		);
	});

	it("falls back to a hashed id when the title slugs to empty", async () => {
		ts = await makeTempStore();
		const out = await handleRemember(
			ts.store,
			loadSettings(),
			{ type: "decision", title: "!!! ???", body: "punctuation-only title" },
		);
		const ref = out.split("ref: ")[1]?.trim();
		expect(ref).toMatch(/^decision\/note-[0-9a-f]{8}$/);
		expect(ts.store.store.getNode("decision", ref!.split("/")[1]!)).not.toBeNull();
	});

	it("rejects a malformed supersede ref with a friendly message and writes nothing", async () => {
		ts = await makeTempStore();
		const out = await handleRemember(
			ts.store,
			loadSettings(),
			{ type: "decision", title: "New", body: "v2", ref: "tiny-notes/foo" },
		);
		expect(out).toContain('Invalid ref "tiny-notes/foo"');
		expect(ts.store.store.getNode("decision", "new")).toBeNull();
	});

	it("creates a supersedes edge to an existing node when ref is given", async () => {
		ts = await makeTempStore();
		const settings = loadSettings();
		await handleRemember(ts.store, settings, { type: "decision", title: "Old", body: "v1" });
		await handleRemember(ts.store, settings, {
			type: "decision",
			title: "New",
			body: "v2",
			ref: "decision/old",
		});

		const edges = ts.store.store.outboundEdges({ type: "decision", id: "new" }, "supersedes");
		expect(edges).toHaveLength(1);
		expect(edges[0]!.to).toEqual({ type: "decision", id: "old" });
	});
});
