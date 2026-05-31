import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { CandidateQueue, type MemoryCandidate } from "../../src/candidate-queue.js";
import { loadSettings } from "../../src/settings.js";

let dir: string | undefined;
afterEach(() => {
	if (dir) fs.rmSync(dir, { recursive: true, force: true });
	dir = undefined;
});

function tempDir(): string {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), "akg-cq-"));
	return dir;
}

function candidate(id: string, title: string): MemoryCandidate {
	return {
		id,
		type: "decision",
		title,
		body: "body",
		confidence: 0.8,
		origin: "compaction",
		provenance: { source: "auto", last_seen_at: "2026-05-30T12:00:00.000Z" },
		createdAt: "2026-05-30T12:00:00.000Z",
	};
}

describe("CandidateQueue (integration)", () => {
	it("appends, lists in order, removes, and persists across reopen", () => {
		const cwd = tempDir();
		const settings = loadSettings();
		const q = CandidateQueue.open(cwd, settings);

		q.append(candidate("a", "First"));
		q.append(candidate("b", "Second"));
		expect(q.list().map((c) => c.id)).toEqual(["a", "b"]);

		q.remove("a");
		expect(q.list().map((c) => c.id)).toEqual(["b"]);

		// Reopen from the same path → surviving candidate is still there.
		const q2 = CandidateQueue.open(cwd, settings);
		const survivors = q2.list();
		expect(survivors).toHaveLength(1);
		expect(survivors[0]!.id).toBe("b");
		expect(survivors[0]!.title).toBe("Second");
	});

	it("treats a missing file as an empty queue", () => {
		const q = CandidateQueue.open(tempDir(), loadSettings());
		expect(q.list()).toEqual([]);
		expect(q.get("nope")).toBeUndefined();
	});

	it("skips a truncated trailing line rather than throwing", () => {
		const cwd = tempDir();
		const settings = loadSettings();
		const q = CandidateQueue.open(cwd, settings);
		q.append(candidate("valid", "Good"));

		// Simulate an interrupted append: a partial JSON line with no newline.
		fs.appendFileSync(q.filePath, '{"id":');

		const list = q.list();
		expect(list).toHaveLength(1);
		expect(list[0]!.id).toBe("valid");
	});

	it("clear empties the queue", () => {
		const q = CandidateQueue.open(tempDir(), loadSettings());
		q.append(candidate("a", "A"));
		q.clear();
		expect(q.list()).toEqual([]);
	});
});
