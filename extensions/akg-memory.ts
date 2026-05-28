import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";

export default function akgMemoryExtension(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, _ctx) => {
		process.stderr.write("[akg-memory] session_start fired\n");
	});

	pi.on("before_agent_start", async (_event) => {
		process.stderr.write("[akg-memory] before_agent_start fired\n");
	});

	pi.on("session_shutdown", async (_event, _ctx) => {
		process.stderr.write("[akg-memory] session_shutdown fired\n");
	});

	pi.registerTool({
		name: "memory_remember",
		label: "Memory Remember",
		description: "Store a durable typed memory record in the project AKG knowledge graph.",
		parameters: Type.Object({
			type: Type.String({ description: "Node type (e.g. decision, constraint, preference, task)" }),
			title: Type.String({ description: "Short title for the memory record" }),
			body: Type.String({ description: "Full content of the memory record" }),
		}),
		async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
			return {
				content: [{ type: "text", text: "placeholder: not yet implemented" }],
				details: {},
			};
		},
	});

	pi.registerCommand("memory-status", {
		description: "Show AKG memory package status",
		handler: async (_args, ctx) => {
			const cwd = process.cwd();
			const text = `Memory status: placeholder — AKG not yet initialized.\ncwd: ${cwd}`;
			ctx.ui.notify(text, "info");
		},
	});
}
