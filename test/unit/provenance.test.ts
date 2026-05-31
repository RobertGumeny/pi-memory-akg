import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	buildAutoProvenance,
	buildProvenance,
	mergeProvenance,
} from "../../src/provenance.js";

const NOW_ISO = "2026-05-30T12:00:00.000Z";

describe("provenance", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(NOW_ISO));
	});
	afterEach(() => vi.useRealTimers());

	describe("buildProvenance", () => {
		it("includes only the context fields that are provided", () => {
			const p = buildProvenance({ cwd: "/repo", source: "manual" });
			expect(p.cwd).toBe("/repo");
			expect(p.source).toBe("manual");
			expect("session_id" in p).toBe(false);
			expect("entry_ids" in p).toBe(false);
		});

		it("always stamps last_seen_at with the current time", () => {
			expect(buildProvenance({}).last_seen_at).toBe(NOW_ISO);
		});
	});

	describe("mergeProvenance", () => {
		it("overlays the update over the existing record", () => {
			const merged = mergeProvenance(
				{ cwd: "/repo", source: "old", last_seen_at: "2000-01-01T00:00:00.000Z" },
				{ source: "new" },
			);
			expect(merged.cwd).toBe("/repo");
			expect(merged.source).toBe("new");
		});

		it("always refreshes last_seen_at, even when the update omits it", () => {
			const merged = mergeProvenance(
				{ cwd: "/repo", last_seen_at: "2000-01-01T00:00:00.000Z" },
				{ source: "x" },
			);
			expect(merged.last_seen_at).toBe(NOW_ISO);
		});
	});

	describe("buildAutoProvenance", () => {
		it("stamps auto source, origin, confidence, and the current time", () => {
			const p = buildAutoProvenance({ origin: "compaction", confidence: 0.8 });
			expect(p.source).toBe("auto");
			expect(p.origin).toBe("compaction");
			expect(p.confidence).toBe(0.8);
			expect(p.last_seen_at).toBe(NOW_ISO);
		});

		it("omits fields that were not provided", () => {
			const p = buildAutoProvenance({ origin: "branch", confidence: 0.5 });
			expect("session_id" in p).toBe(false);
			expect("summary_entry_id" in p).toBe(false);
			expect("cwd" in p).toBe(false);
		});

		it("includes the summary entry id when provided", () => {
			const p = buildAutoProvenance({
				origin: "compaction",
				confidence: 0.9,
				summaryEntryId: "entry-42",
			});
			expect(p.summary_entry_id).toBe("entry-42");
		});
	});

	it("produces a parseable ISO-8601 timestamp", () => {
		const ts = buildProvenance({}).last_seen_at;
		expect(new Date(ts).toISOString()).toBe(ts);
	});
});
