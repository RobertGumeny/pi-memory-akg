import { NODE_TYPES } from "./schema.js";
import type { Settings } from "./settings.js";

export type RiskAssessment =
	| { action: "write" }
	| { action: "confirm"; reason: string }
	| { action: "reject"; reason: string };

// Patterns that indicate potentially sensitive or secret-like content
const SECRET_PATTERNS = [
	/\b(password|passwd|secret|token|api[_\s-]?key|private[_\s-]?key|access[_\s-]?key|auth[_\s-]?key|credential|bearer)\b/i,
	/\b[A-Za-z0-9]{20,}\b/, // Long opaque tokens
	/\bsk-[A-Za-z0-9]{10,}\b/, // OpenAI-style keys
	/\bghp_[A-Za-z0-9]{10,}\b/, // GitHub tokens
	/\bAKIA[A-Z0-9]{16}\b/, // AWS access keys
	/-----BEGIN\s+(RSA\s+)?PRIVATE KEY-----/,
];

const LOW_CONFIDENCE_TAGS = ["confidence:low", "unverified", "inferred"];

function looksLikeSecret(text: string): boolean {
	return SECRET_PATTERNS.some((pattern) => pattern.test(text));
}

export function assessRisk(
	record: { type: string; title: string; body: string; tags?: string[] },
	uiAvailable: boolean,
	settings: Settings,
): RiskAssessment {
	if (settings.requireConfirmationForAll) {
		return { action: "confirm", reason: "ask-before-every-write enabled" };
	}

	const tags = record.tags ?? [];

	// Check for ambiguous type
	if (!record.type || !(NODE_TYPES as readonly string[]).includes(record.type)) {
		const reason = `type "${record.type}" is not a recognized node type`;
		return uiAvailable
			? { action: "confirm", reason }
			: { action: "reject", reason: `Cannot store memory without user confirmation: ${reason}. Use a valid type (${NODE_TYPES.join(", ")}) or request confirmation.` };
	}

	// Check for low-confidence tags
	const lowConfTag = tags.find((t) => LOW_CONFIDENCE_TAGS.includes(t));
	if (lowConfTag) {
		const reason = `tag "${lowConfTag}" indicates low confidence`;
		return uiAvailable
			? { action: "confirm", reason }
			: { action: "reject", reason: `Cannot store memory without user confirmation: ${reason}.` };
	}

	// Check for secret-like content
	if (looksLikeSecret(record.title) || looksLikeSecret(record.body)) {
		const reason = "content appears to contain sensitive or secret-like information";
		return uiAvailable
			? { action: "confirm", reason }
			: { action: "reject", reason: `Cannot store memory without user confirmation: ${reason}. Do not store raw secrets in AKG memory.` };
	}

	return { action: "write" };
}
