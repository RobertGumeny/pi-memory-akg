/**
 * Spike / smoke for the Phase 2 model adapter (TASKS.md P2-011).
 *
 * Proves the pi-ai one-shot completion path end-to-end WITHOUT the full Pi runtime:
 * pick a provider we have an env API key for, grab a cheap model, and round-trip one
 * tiny prompt through `completeSimple` — the exact primitive `src/llm.ts` uses.
 *
 * Run: `npx tsx scripts/smoke-llm.ts`
 * - With a provider key in the environment (e.g. ANTHROPIC_API_KEY): does a live call,
 *   prints the model + reply, exits 0 on non-empty text.
 * - With no key: prints "skipped: no model" and exits 0 (Pi stores creds in its own
 *   AuthStorage, reachable only via ctx.modelRegistry inside a session — see P2-012).
 */
import {
	completeSimple,
	getEnvApiKey,
	getModels,
	type Api,
	type Model,
	type TextContent,
} from "@earendil-works/pi-ai";

// Providers whose env keys getEnvApiKey understands, cheapest-first-ish preference.
const PREFERRED_PROVIDERS = [
	"anthropic",
	"openai",
	"google",
	"groq",
	"xai",
	"deepseek",
	"mistral",
	"openrouter",
] as const;

const CHEAP_MODEL_HINT = /haiku|mini|flash|small|lite|nano|8b/i;

function pickModelWithKey(): { model: Model<Api>; apiKey: string } | undefined {
	for (const provider of PREFERRED_PROVIDERS) {
		const apiKey = getEnvApiKey(provider);
		if (!apiKey) continue;
		const models = getModels(provider) as Model<Api>[];
		if (!models.length) continue;
		const model = models.find((m) => CHEAP_MODEL_HINT.test(m.id)) ?? models[0];
		return { model, apiKey };
	}
	return undefined;
}

async function main(): Promise<void> {
	const picked = pickModelWithKey();
	if (!picked) {
		console.log("skipped: no model");
		return;
	}
	const { model, apiKey } = picked;

	const result = await completeSimple(
		model,
		{ messages: [{ role: "user", content: "Reply with exactly: OK", timestamp: Date.now() }] },
		{ apiKey, maxTokens: 16, temperature: 0 },
	);

	const text = result.content
		.filter((c): c is TextContent => c.type === "text")
		.map((c) => c.text)
		.join("")
		.trim();

	console.log(`model=${model.provider}/${model.id} stop=${result.stopReason} text=${JSON.stringify(text)}`);
	if (!text) {
		console.error("FAIL: empty text from model");
		process.exit(1);
	}
	console.log("PASS");
}

main().catch((err) => {
	console.error("ERROR:", err instanceof Error ? err.message : err);
	process.exit(1);
});
