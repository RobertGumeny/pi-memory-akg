import { NODE_TYPES } from "./schema.js";
import { buildAutoProvenance } from "./provenance.js";
import { slugify, shortHash } from "./tools/remember.js";
import type { MemoryCandidate } from "./candidate-queue.js";
import type { Settings } from "./settings.js";

/**
 * The single LLM dependency the extraction pipeline needs. Binding this to a
 * real `ctx.model` lives in (untested) extension glue (`src/llm.ts`); all logic
 * here is exercised with a fake in unit tests.
 */
export type LlmFn = (
	prompt: string,
	opts?: { signal?: AbortSignal },
) => Promise<string>;

export interface ProvenanceBase {
	cwd?: string;
	sessionId?: string;
	entryIds?: string[];
	summaryEntryId?: string;
}

interface RawCandidate {
	type?: unknown;
	title?: unknown;
	body?: unknown;
	tags?: unknown;
	confidence?: unknown;
}

const NODE_TYPE_SET: ReadonlySet<string> = new Set(NODE_TYPES);

function buildPrompt(summaryText: string, origin: "compaction" | "branch"): string {
	return [
		"You extract DURABLE PROJECT MEMORY from a distilled work summary.",
		`The summary below is a Pi ${origin} summary.`,
		"",
		"Return STRICT JSON ONLY: an array of objects with this shape:",
		'  { "type": <one of: ' +
			NODE_TYPES.join(", ") +
			'>, "title": string, "body": string, "tags"?: string[], "confidence": number (0..1) }',
		"",
		"Capture ONLY reusable, durable facts: decisions, constraints, preferences,",
		"active tasks, artifacts, repo facts, and concepts/patterns worth remembering.",
		"Do NOT echo transcript lines, narration, or ephemeral chatter.",
		"Set confidence to how sure you are this is a durable, correctly-stated fact.",
		"If nothing is worth remembering, return [].",
		"",
		"SUMMARY:",
		summaryText,
	].join("\n");
}

/**
 * Strip a code fence (```json ... ```), if present, and return the inner text.
 * Tolerates leading/trailing prose around a single fenced block.
 */
function stripCodeFence(text: string): string {
	const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fence && fence[1] !== undefined) return fence[1].trim();
	return text.trim();
}

/** Parse the model response into an array of raw items. Never throws → []. */
function parseResponse(text: string): RawCandidate[] {
	const candidate = stripCodeFence(text);
	let parsed: unknown;
	try {
		parsed = JSON.parse(candidate);
	} catch {
		return [];
	}
	if (Array.isArray(parsed)) return parsed as RawCandidate[];
	return [];
}

function isValidType(t: unknown): t is string {
	return typeof t === "string" && NODE_TYPE_SET.has(t);
}

function isNonEmptyString(s: unknown): s is string {
	return typeof s === "string" && s.trim() !== "";
}

function isUnitConfidence(c: unknown): c is number {
	return typeof c === "number" && Number.isFinite(c) && c >= 0 && c <= 1;
}

/**
 * Turn a distilled summary into validated, provenance-stamped candidates using
 * an injected LLM. Defensive throughout: malformed JSON → [], invalid items
 * dropped, output capped to settings.maxCandidatesPerExtraction.
 */
export async function extractCandidates(
	input: {
		summaryText: string;
		origin: "compaction" | "branch";
		provenanceBase: ProvenanceBase;
	},
	llm: LlmFn,
	settings: Settings,
	opts?: { signal?: AbortSignal },
): Promise<MemoryCandidate[]> {
	const prompt = buildPrompt(input.summaryText, input.origin);

	let raw: string;
	try {
		raw = await llm(prompt, { signal: opts?.signal });
	} catch {
		return [];
	}

	const items = parseResponse(raw);
	const out: MemoryCandidate[] = [];
	const createdAt = new Date().toISOString();

	for (const item of items) {
		if (out.length >= settings.maxCandidatesPerExtraction) break;
		if (!isValidType(item.type)) continue;
		if (!isNonEmptyString(item.title)) continue;
		if (!isNonEmptyString(item.body)) continue;
		if (!isUnitConfidence(item.confidence)) continue;

		const tags = Array.isArray(item.tags)
			? item.tags.filter((t): t is string => typeof t === "string")
			: undefined;

		const provenance = buildAutoProvenance({
			cwd: input.provenanceBase.cwd,
			sessionId: input.provenanceBase.sessionId,
			entryIds: input.provenanceBase.entryIds,
			origin: input.origin,
			summaryEntryId: input.provenanceBase.summaryEntryId,
			confidence: item.confidence,
		});

		const slug = slugify(item.title);
		const id = `${input.origin}-${slug}-${shortHash(`${item.type}/${slug}`)}`;

		const candidate: MemoryCandidate = {
			id,
			type: item.type,
			title: item.title,
			body: item.body,
			confidence: item.confidence,
			origin: input.origin,
			provenance,
			createdAt,
		};
		if (tags && tags.length > 0) candidate.tags = tags;
		out.push(candidate);
	}

	return out;
}
