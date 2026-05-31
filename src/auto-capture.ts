import type { MemoryStore } from "./memory-store.js";
import { CandidateQueue, type MemoryCandidate } from "./candidate-queue.js";
import { classifyCandidate } from "./dedup.js";
import { routeCandidate } from "./capture-policy.js";
import { extractCandidates, type LlmFn, type ProvenanceBase } from "./extraction.js";
import { slugify } from "./tools/remember.js";
import { parseRef } from "./ref.js";
import {
	META_CWD,
	META_SESSION_ID,
	META_ENTRY_IDS,
	META_SOURCE,
	META_STATUS,
	META_LAST_SEEN_AT,
	STATUS_UNREVIEWED,
} from "./schema.js";
import type { Settings } from "./settings.js";

export interface AutoCaptureReport {
	committed: string[]; // refs ("type/id") written to the graph
	deferred: string[]; // candidate ids appended to the queue
	dropped: number;
	duplicates: number;
}

/**
 * Flatten an auto-captured candidate's provenance into node meta and write it
 * to the graph as an unreviewed/auto record. On an "update" classification the
 * caller passes `existingId` so we upsert in place rather than creating a
 * sibling. Returns the written node ref ("type/id").
 */
function writeCandidate(
	store: MemoryStore,
	candidate: MemoryCandidate,
	existingId: string | undefined,
): string {
	const id = existingId ? parseRef(existingId).id : slugify(candidate.title);
	const p = candidate.provenance;

	const meta: Record<string, unknown> = {
		[META_STATUS]: STATUS_UNREVIEWED,
		[META_SOURCE]: p.source ?? "auto",
		[META_LAST_SEEN_AT]: p.last_seen_at,
	};
	if (p.cwd !== undefined) meta[META_CWD] = p.cwd;
	if (p.session_id !== undefined) meta[META_SESSION_ID] = p.session_id;
	if (p.entry_ids !== undefined) meta[META_ENTRY_IDS] = p.entry_ids;
	if (p.origin !== undefined) meta.origin = p.origin;
	if (p.summary_entry_id !== undefined) meta.summary_entry_id = p.summary_entry_id;
	if (p.confidence !== undefined) meta.confidence = p.confidence;

	store.store.putNode(
		candidate.type,
		id,
		{ title: candidate.title, body: candidate.body, meta },
		candidate.tags ?? [],
	);
	return `${candidate.type}/${id}`;
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
				const ref = writeCandidate(
					args.store,
					candidate,
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
