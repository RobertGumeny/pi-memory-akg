/**
 * Model adapter — the ONLY Phase 2 module that touches the real Pi/pi-ai model API.
 *
 * It adapts a Pi `ctx.model` + `ctx.modelRegistry` into the injected `LlmFn` that
 * `src/extraction.ts` (P2-005) consumes. Keeping this boundary thin is deliberate:
 * extraction logic stays unit-testable with a fake `LlmFn`, and only this file needs
 * the live model runtime (which `test/testing-strategy.md` lists as the intentional
 * untested gap). See TASKS.md P2-011.
 */
import { completeSimple } from "@earendil-works/pi-ai";
import type { Api, AssistantMessage, Context, Model, TextContent } from "@earendil-works/pi-ai";
import type { LlmFn } from "./extraction.js";

// `LlmFn` is owned by `src/extraction.ts` (P2-005) so extraction never depends on
// this model adapter. Re-exported here for the convenience of P2-012 glue, which
// imports both `makeLlmFn` and the type from one place.
export type { LlmFn };

/**
 * Structural slice of Pi's `ModelRegistry` (from `ctx.modelRegistry`) that we need.
 * Typed structurally so this module does not hard-depend on a pi-coding-agent class.
 */
export interface AuthResolver {
	getApiKeyAndHeaders(
		model: Model<Api>,
	): Promise<
		| { ok: true; apiKey?: string; headers?: Record<string, string> }
		| { ok: false; error: string }
	>;
}

export interface MakeLlmFnOptions {
	/** Hard cap on output tokens for an extraction call. Extraction output is small. */
	maxTokens?: number;
	/** Deterministic extraction wants temperature 0 by default. */
	temperature?: number;
}

/** Concatenate the assistant message's text parts, ignoring thinking/tool-call parts. */
function extractText(content: AssistantMessage["content"]): string {
	return content
		.filter((c): c is TextContent => c.type === "text")
		.map((c) => c.text)
		.join("");
}

/**
 * Build the `LlmFn` from a Pi model + auth resolver.
 *
 * Rejects with a clear, catchable error when no model is available or auth cannot be
 * resolved. Callers (P2-012 extension glue) must treat a rejection as "extraction is a
 * no-op this time" — auto-capture must never crash a session over a model failure.
 */
export function makeLlmFn(
	model: Model<Api> | undefined,
	registry: AuthResolver | undefined,
	options: MakeLlmFnOptions = {},
): LlmFn {
	return async (prompt, opts) => {
		if (!model) {
			throw new Error("[akg-memory] No model available for extraction.");
		}

		let apiKey: string | undefined;
		let headers: Record<string, string> | undefined;
		if (registry) {
			const auth = await registry.getApiKeyAndHeaders(model);
			if (!auth.ok) {
				throw new Error(`[akg-memory] Could not resolve model auth: ${auth.error}`);
			}
			apiKey = auth.apiKey;
			headers = auth.headers;
		}

		const context: Context = {
			messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
		};

		const result = await completeSimple(model, context, {
			apiKey,
			headers,
			maxTokens: options.maxTokens ?? 1024,
			temperature: options.temperature ?? 0,
			signal: opts?.signal,
		});

		if (result.stopReason === "error" || result.stopReason === "aborted") {
			throw new Error(
				`[akg-memory] Extraction model call ${result.stopReason}: ${result.errorMessage ?? "unknown error"}`,
			);
		}

		return extractText(result.content);
	};
}
