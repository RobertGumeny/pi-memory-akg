import type { Node } from "akg-ts";
import type { MemoryStore } from "../memory-store.js";
import { handleForget } from "./forget.js";
import {
	META_STATUS,
	META_SESSION_ID,
	META_SOURCE,
	STATUS_UNREVIEWED,
} from "../schema.js";

export type RevertMode = "deactivate" | "delete";

export interface UnreviewedFilter {
	origin?: string;
	sessionId?: string;
	sinceMs?: number; // age window: only nodes updated within the last sinceMs
}

/**
 * Auto-captured nodes still awaiting review: `meta.status === "unreviewed"` and
 * `meta.source === "auto"`, optionally narrowed by origin / session / recency.
 */
export function findUnreviewed(store: MemoryStore, filter: UnreviewedFilter = {}): Node[] {
	const sinceUpdatedAt =
		filter.sinceMs !== undefined ? Date.now() - filter.sinceMs : undefined;

	return store.store.listNodes().filter((n) => {
		if ((n.meta[META_STATUS] as string | undefined) !== STATUS_UNREVIEWED) return false;
		if ((n.meta[META_SOURCE] as string | undefined) !== "auto") return false;
		if (filter.origin !== undefined && (n.meta.origin as string | undefined) !== filter.origin)
			return false;
		if (
			filter.sessionId !== undefined &&
			(n.meta[META_SESSION_ID] as string | undefined) !== filter.sessionId
		)
			return false;
		if (sinceUpdatedAt !== undefined && n.updatedAt < sinceUpdatedAt) return false;
		return true;
	});
}

/**
 * Forward revert (NOT a WAL rollback): apply the Phase 1 forget operation to
 * each id. Default `deactivate` (status → inactive); `delete` cascade-removes.
 */
export async function revert(
	store: MemoryStore,
	ids: string[],
	mode: RevertMode = "deactivate",
): Promise<string[]> {
	const done: string[] = [];
	for (const id of ids) {
		if (mode === "delete") {
			await handleForget(store, { id, mode: "delete", cascade: true });
		} else {
			await handleForget(store, { id, mode: "deactivate" });
		}
		done.push(id);
	}
	return done;
}

/**
 * Tool handler for `memory_revert`. Without `confirm` it returns a dry-run
 * summary (count + affected ids/titles); with `confirm: true` it performs the
 * revert. Reuses Phase 1 forget — a forward operation, not a rollback.
 */
export async function handleRevert(
	store: MemoryStore,
	args: {
		mode?: RevertMode;
		origin?: string;
		sessionId?: string;
		sinceMs?: number;
		confirm?: boolean;
	},
): Promise<string> {
	const mode: RevertMode = args.mode ?? "deactivate";
	const matches = findUnreviewed(store, {
		origin: args.origin,
		sessionId: args.sessionId,
		sinceMs: args.sinceMs,
	});

	if (matches.length === 0) {
		return "No unreviewed auto-captured memories match. Nothing to revert.";
	}

	const list = matches
		.map((n) => `  [${n.type}] ${n.title} (id: ${n.type}/${n.id})`)
		.join("\n");

	if (!args.confirm) {
		return [
			`Dry run: ${matches.length} unreviewed auto-captured memor${matches.length === 1 ? "y" : "ies"} would be ${mode === "delete" ? "deleted" : "deactivated"}:`,
			list,
			"",
			"Re-run with confirm: true to apply. This is a forward forget, not a rollback.",
		].join("\n");
	}

	const ids = matches.map((n) => `${n.type}/${n.id}`);
	await revert(store, ids, mode);
	return `Reverted ${ids.length} memor${ids.length === 1 ? "y" : "ies"} (mode: ${mode}).`;
}

/** Minimal UI surface needed by the interactive `/memory-revert` command. */
export interface RevertUI {
	confirm(title: string, message: string): Promise<boolean>;
	notify(message: string, type?: "info" | "warning" | "error"): void;
}

/**
 * Interactive `/memory-revert`: show the dry-run, confirm, then revert. With no
 * UI, point the user at the `memory_revert` tool.
 */
export async function runInteractiveRevert(
	store: MemoryStore,
	ui: RevertUI,
	hasUI: boolean,
	args: { mode?: RevertMode; origin?: string; sessionId?: string; sinceMs?: number } = {},
): Promise<void> {
	const dryRun = await handleRevert(store, { ...args, confirm: false });
	if (dryRun.startsWith("No unreviewed")) {
		ui.notify(dryRun, "info");
		return;
	}
	if (!hasUI) {
		ui.notify(
			`${dryRun}\n\n(No interactive UI — use the memory_revert tool with confirm: true to apply.)`,
			"info",
		);
		return;
	}
	const ok = await ui.confirm("Revert auto-captured memories?", dryRun);
	if (!ok) {
		ui.notify("Revert cancelled. Nothing changed.", "info");
		return;
	}
	const result = await handleRevert(store, { ...args, confirm: true });
	ui.notify(result, "info");
}
