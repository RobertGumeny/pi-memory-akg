import type { MemoryStore } from "../memory-store.js";
import type { Settings } from "../settings.js";
import { CandidateQueue, type MemoryCandidate } from "../candidate-queue.js";
import { writeCandidateNode } from "../capture-write.js";
import { STATUS_ACTIVE } from "../schema.js";

export interface CandidateEdits {
	type?: string;
	title?: string;
	body?: string;
	tags?: string[];
}

/** All pending candidates, in insertion order. */
export function listPending(queue: CandidateQueue): MemoryCandidate[] {
	return queue.list();
}

/**
 * Promote a pending candidate to a real, human-reviewed graph node
 * (`status: "active"`), applying optional edits, then remove it from the queue.
 *
 * Atomic per candidate: the graph write + commit happens first, so if it throws
 * the candidate stays in the queue (nothing half-applied). The queue removal
 * only runs once the node is durably committed.
 */
export async function accept(
	queue: CandidateQueue,
	store: MemoryStore,
	id: string,
	edits?: CandidateEdits,
): Promise<string> {
	const c = queue.get(id);
	if (!c) return `No pending candidate with id '${id}'.`;

	const merged: Pick<MemoryCandidate, "type" | "title" | "body" | "tags" | "provenance"> = {
		type: edits?.type ?? c.type,
		title: edits?.title ?? c.title,
		body: edits?.body ?? c.body,
		tags: edits?.tags ?? c.tags,
		provenance: c.provenance,
	};

	const ref = writeCandidateNode(store, merged, STATUS_ACTIVE);
	await store.commit();
	queue.remove(id);
	return `Accepted ${ref} (status: active)`;
}

/** Discard a pending candidate. No graph write. */
export async function reject(queue: CandidateQueue, id: string): Promise<string> {
	const c = queue.get(id);
	if (!c) return `No pending candidate with id '${id}'.`;
	queue.remove(id);
	return `Rejected ${id}`;
}

/** Compact, budget-bounded summary of pending candidates (one line each). */
export function formatPending(candidates: MemoryCandidate[], budget: number): string {
	if (candidates.length === 0) return "No pending memory candidates.";

	const lines: string[] = ["Pending memory candidates:"];
	let total = lines[0]!.length + 1;
	let shown = 0;
	for (const c of candidates) {
		const conf = c.confidence.toFixed(2);
		const tags = c.tags && c.tags.length > 0 ? `, tags: ${c.tags.join(", ")}` : "";
		const line = `[${c.type}] ${c.title} (id: ${c.id}, confidence: ${conf}, origin: ${c.origin}${tags})`;
		if (total + line.length + 1 > budget && shown > 0) break;
		lines.push(line);
		total += line.length + 1;
		shown += 1;
	}
	const omitted = candidates.length - shown;
	if (omitted > 0) lines.push(`… and ${omitted} more (raise limit or accept/reject to clear).`);
	return lines.join("\n");
}

/**
 * Tool handler for `memory_review`. Usable by the agent and by an orchestrator
 * over RPC. `action: "list"` returns a bounded summary; `accept`/`reject`
 * mutate the queue/graph.
 */
export async function handleReview(
	queue: CandidateQueue,
	store: MemoryStore,
	settings: Settings,
	args: {
		action: "list" | "accept" | "reject";
		id?: string;
		edits?: CandidateEdits;
	},
): Promise<string> {
	switch (args.action) {
		case "list":
			return formatPending(listPending(queue), settings.toolResultBudget);
		case "accept":
			if (!args.id) return "Error: accept requires an 'id'.";
			return accept(queue, store, args.id, args.edits);
		case "reject":
			if (!args.id) return "Error: reject requires an 'id'.";
			return reject(queue, args.id);
		default:
			return `Error: unknown action '${(args as { action: string }).action}'.`;
	}
}

/** Minimal UI surface needed by the interactive `/memory-review` walk. */
export interface ReviewUI {
	select(title: string, options: string[]): Promise<string | undefined>;
	notify(message: string, type?: "info" | "warning" | "error"): void;
}

/**
 * Interactive `/memory-review` walk. When UI is available, step through each
 * pending candidate offering accept/reject/skip; otherwise point the user at the
 * `memory_review` tool.
 */
export async function runInteractiveReview(
	queue: CandidateQueue,
	store: MemoryStore,
	ui: ReviewUI,
	hasUI: boolean,
): Promise<void> {
	const pending = listPending(queue);
	if (pending.length === 0) {
		ui.notify("No pending memory candidates to review.", "info");
		return;
	}
	if (!hasUI) {
		ui.notify(
			`${pending.length} pending candidate(s). Use the memory_review tool (action: "list" | "accept" | "reject") to review them.`,
			"info",
		);
		return;
	}

	let accepted = 0;
	let rejected = 0;
	for (const c of pending) {
		const choice = await ui.select(
			`[${c.type}] ${c.title} (confidence ${c.confidence.toFixed(2)}, ${c.origin})`,
			["accept", "reject", "skip"],
		);
		if (choice === "accept") {
			await accept(queue, store, c.id);
			accepted += 1;
		} else if (choice === "reject") {
			await reject(queue, c.id);
			rejected += 1;
		} else if (choice === undefined) {
			break; // dialog dismissed → stop the walk, leave the rest pending
		}
	}
	ui.notify(
		`Review complete: ${accepted} accepted, ${rejected} rejected, ${listPending(queue).length} still pending.`,
		"info",
	);
}
