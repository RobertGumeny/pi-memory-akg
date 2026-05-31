import { assessRisk } from "./risk-policy.js";
import type { MemoryCandidate } from "./candidate-queue.js";
import type { Settings } from "./settings.js";

export type CaptureAction = "auto-commit" | "defer" | "drop";

export interface CaptureRoute {
	action: CaptureAction;
	reason: string;
}

/**
 * Route a candidate to auto-commit, defer (to the pending queue), or drop,
 * combining confidence, the Phase 1 risk assessment, UI availability, and the
 * headless policy. Pure function — no I/O.
 *
 * Decision order (per TASKS P2-006):
 *   1. confidence below dropBelowConfidence → drop.
 *   2. not a clean risk "write" (sensitive/secret/low-conf/ambiguous) → defer.
 *   3. clean AND confidence >= autoCommitMinConfidence:
 *        interactive                         → defer (a human is present)
 *        headless + headlessPolicy auto-commit → auto-commit
 *        headless + headlessPolicy defer       → defer
 *        headlessPolicy off                    → drop
 *   4. otherwise → defer.
 */
export function routeCandidate(
	candidate: MemoryCandidate,
	ctx: { hasUI: boolean },
	settings: Settings,
): CaptureRoute {
	if (candidate.confidence < settings.dropBelowConfidence) {
		return {
			action: "drop",
			reason: `confidence ${candidate.confidence} below dropBelowConfidence ${settings.dropBelowConfidence}`,
		};
	}

	// Run the Phase 1 risk gate. UI availability is passed so the assessment
	// matches how a manual write would be treated; here we only care whether it
	// is a clean "write".
	const risk = assessRisk(
		{
			type: candidate.type,
			title: candidate.title,
			body: candidate.body,
			tags: candidate.tags,
		},
		ctx.hasUI,
		settings,
	);
	if (risk.action !== "write") {
		const reason = "reason" in risk ? risk.reason : "risk gate flagged candidate";
		return { action: "defer", reason: `deferred for review: ${reason}` };
	}

	if (candidate.confidence >= settings.autoCommitMinConfidence) {
		if (ctx.hasUI) {
			return { action: "defer", reason: "interactive session — defer for human review" };
		}
		switch (settings.headlessPolicy) {
			case "auto-commit":
				return { action: "auto-commit", reason: "headless auto-commit: confident and clean" };
			case "defer":
				return { action: "defer", reason: "headless policy defer" };
			case "off":
				return { action: "drop", reason: "headless policy off — auto-capture disabled" };
		}
	}

	return { action: "defer", reason: "confidence below auto-commit threshold" };
}
