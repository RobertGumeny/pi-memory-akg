import type { MemoryStore } from "./memory-store.js";
import { CandidateQueue } from "./candidate-queue.js";
import { classifyCandidate } from "./dedup.js";
import { routeCandidate } from "./capture-policy.js";
import { extractCandidates, type LlmFn, type ProvenanceBase } from "./extraction.js";
import { writeCandidateNode } from "./capture-write.js";
import { STATUS_UNREVIEWED } from "./schema.js";
import type { Settings } from "./settings.js";

export interface AutoCaptureReport {
	committed: string[]; // refs ("type/id") written to the graph
	deferred: string[]; // candidate ids appended to the queue
	dropped: number;
	duplicates: number;
}

/**
 * Run the full capture pipeline for one distilled summary:
 *   extract → classify (dedup) → route (gate) → commit / defer / drop.
 *
 * Gate-then-write: the `.akg` graph only ever receives memories that passed the
 * gate. Deferred candidates go to the sidecar queue, never the graph. A single
 * bad candidate is isolated and never aborts the batch. `store.commit()` runs
 * exactly once, only if something was committed.
 */
export async function runAutoCapture(args: {
	store: MemoryStore;
	queue: CandidateQueue;
	summaryText: string;
	origin: "compaction" | "branch";
	provenanceBase: ProvenanceBase;
	llm: LlmFn;
	settings: Settings;
	hasUI: boolean;
	signal?: AbortSignal;
}): Promise<AutoCaptureReport> {
	const report: AutoCaptureReport = {
		committed: [],
		deferred: [],
		dropped: 0,
		duplicates: 0,
	};

	const candidates = await extractCandidates(
		{
			summaryText: args.summaryText,
			origin: args.origin,
			provenanceBase: args.provenanceBase,
		},
		args.llm,
		args.settings,
		{ signal: args.signal },
	);

	let committedAny = false;

	for (const candidate of candidates) {
		try {
			const pending = args.queue.list();
			const dedup = classifyCandidate(candidate, args.store, pending);
			if (dedup.action === "duplicate") {
				report.duplicates += 1;
				continue;
			}

			const route = routeCandidate(candidate, { hasUI: args.hasUI }, args.settings);
			if (route.action === "drop") {
				report.dropped += 1;
			} else if (route.action === "defer") {
				args.queue.append(candidate);
				report.deferred.push(candidate.id);
			} else {
				// auto-commit — upsert in place on an "update" classification.
				const ref = writeCandidateNode(
					args.store,
					candidate,
					STATUS_UNREVIEWED,
					dedup.action === "update" ? dedup.existingId : undefined,
				);
				report.committed.push(ref);
				committedAny = true;
			}
		} catch {
			// Isolate per-candidate failures — never abort the whole batch.
			report.dropped += 1;
		}
	}

	if (committedAny) {
		await args.store.commit();
	}

	return report;
}
