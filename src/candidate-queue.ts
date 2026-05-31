import fs from "fs";
import path from "path";
import type { ProvenanceMetadata } from "./provenance.js";
import type { Settings } from "./settings.js";

/**
 * The canonical shape of a pending memory candidate. This lives in a
 * project-local JSONL sidecar (`settings.candidateQueuePath`), NOT in the
 * `.akg` graph — it never touches akg-ts. A candidate becomes a real graph
 * node only when it is accepted/auto-committed (see auto-capture / review).
 */
export interface MemoryCandidate {
	id: string; // queue-local stable id (e.g. `${origin}-${slug}-${shortHash}`)
	type: string; // a NODE_TYPES value
	title: string;
	body: string;
	tags?: string[];
	confidence: number; // 0..1
	origin: "compaction" | "branch" | "turn";
	provenance: ProvenanceMetadata;
	createdAt: string; // ISO timestamp
}

/**
 * A durable, append-oriented JSONL queue of pending memory candidates. A
 * missing file is treated as an empty queue and created on first append. A
 * corrupt/partial trailing line is skipped rather than throwing, so a crash
 * mid-append never bricks the queue.
 */
export class CandidateQueue {
	private _filePath: string;

	private constructor(filePath: string) {
		this._filePath = filePath;
	}

	static open(cwd: string, settings: Settings): CandidateQueue {
		const filePath = path.isAbsolute(settings.candidateQueuePath)
			? settings.candidateQueuePath
			: path.join(cwd, settings.candidateQueuePath);
		return new CandidateQueue(filePath);
	}

	get filePath(): string {
		return this._filePath;
	}

	/** Append a candidate, durably flushing to disk. Creates the file/dir if absent. */
	append(c: MemoryCandidate): void {
		this.ensureDir();
		const line = JSON.stringify(c) + "\n";
		const fd = fs.openSync(this._filePath, "a");
		try {
			fs.writeSync(fd, line);
			fs.fsyncSync(fd);
		} finally {
			fs.closeSync(fd);
		}
	}

	/** All candidates in insertion order. A truncated trailing line is skipped. */
	list(): MemoryCandidate[] {
		let raw: string;
		try {
			raw = fs.readFileSync(this._filePath, "utf8");
		} catch {
			return []; // missing file → empty queue
		}
		const out: MemoryCandidate[] = [];
		for (const line of raw.split("\n")) {
			const trimmed = line.trim();
			if (trimmed === "") continue;
			try {
				const parsed = JSON.parse(trimmed) as MemoryCandidate;
				if (parsed && typeof parsed.id === "string") out.push(parsed);
			} catch {
				// Corrupt/partial line (e.g. from an interrupted append) — skip it.
				continue;
			}
		}
		return out;
	}

	get(id: string): MemoryCandidate | undefined {
		return this.list().find((c) => c.id === id);
	}

	/** Remove the candidate with the given id by rewriting the queue. */
	remove(id: string): void {
		const remaining = this.list().filter((c) => c.id !== id);
		this.rewrite(remaining);
	}

	/** Empty the queue (rewrites the file with no entries). */
	clear(): void {
		this.rewrite([]);
	}

	private rewrite(candidates: MemoryCandidate[]): void {
		this.ensureDir();
		const data = candidates.map((c) => JSON.stringify(c) + "\n").join("");
		fs.writeFileSync(this._filePath, data);
	}

	private ensureDir(): void {
		const dir = path.dirname(this._filePath);
		fs.mkdirSync(dir, { recursive: true });
	}
}
