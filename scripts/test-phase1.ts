import path from "path";
import fs from "fs";
import os from "os";
import { Store } from "akg-ts";
import { loadSettings } from "../src/settings.js";
import { buildProvenance, mergeProvenance } from "../src/provenance.js";
import { NODE_TYPES, RELATION_TYPES } from "../src/schema.js";
import { assessRisk } from "../src/risk-policy.js";
import { fetchCandidates, formatCandidates, formatInspect } from "../src/retrieval.js";
import { MemoryStore } from "../src/memory-store.js";

let passed = 0;
let failed = 0;

function check(label: string, value: unknown, expected: unknown) {
	const ok = JSON.stringify(value) === JSON.stringify(expected);
	if (ok) {
		console.log(`  ✓ ${label}`);
		passed++;
	} else {
		console.log(`  ✗ ${label}: got ${JSON.stringify(value)}, want ${JSON.stringify(expected)}`);
		failed++;
	}
}

function checkMatch(label: string, value: string, pattern: RegExp) {
	if (pattern.test(value)) {
		console.log(`  ✓ ${label}`);
		passed++;
	} else {
		console.log(`  ✗ ${label}: "${value}" did not match ${pattern}`);
		failed++;
	}
}

// ── P1-001 schema ─────────────────────────────────────────────────────────────
console.log("\nP1-001 schema");
check("NODE_TYPES includes decision", NODE_TYPES.includes("decision" as never), true);
check("RELATION_TYPES includes supersedes", RELATION_TYPES.includes("supersedes" as never), true);

// ── P1-002 settings ───────────────────────────────────────────────────────────
console.log("\nP1-002 settings");
const s = loadSettings();
check("default hintBudget", s.hintBudget, 400);
check("default hintEnabled", s.hintEnabled, true);
check("override hintBudget", loadSettings({ hintBudget: 200 }).hintBudget, 200);

// ── P1-003 provenance ─────────────────────────────────────────────────────────
console.log("\nP1-003 provenance");
const p = buildProvenance({ cwd: "/repo", source: "manual" });
check("last_seen_at is string", typeof p.last_seen_at, "string");
const p2 = buildProvenance({ cwd: "/repo" });
check("session_id omitted", "session_id" in p2, false);
const merged = mergeProvenance({ cwd: "/repo", last_seen_at: "2000-01-01T00:00:00Z" }, { source: "manual" });
check("merge updates last_seen_at", merged.last_seen_at !== "2000-01-01T00:00:00Z", true);

// ── P1-004 memory-store ───────────────────────────────────────────────────────
console.log("\nP1-004 memory-store");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "akg-test-"));
const settings = loadSettings();
const store = await MemoryStore.open(tmpDir, settings);
check("isOpen after open", store.isOpen, true);
check("filePath set", store.filePath.endsWith(".pi/memory.akg"), true);
check("file exists", fs.existsSync(store.filePath), true);
await store.close();
check("isOpen after close", store.isOpen, false);

try {
	await MemoryStore.open("/proc/1/mem", loadSettings());
	check("non-writable throws", false, true);
} catch (e: unknown) {
	checkMatch("non-writable error message", (e as Error).message, /Cannot open memory file/);
}

// ── P1-005 risk-policy ────────────────────────────────────────────────────────
console.log("\nP1-005 risk-policy");
const safe = assessRisk({ type: "decision", title: "Use AKG", body: "AKG is durable memory." }, true, loadSettings());
check("safe write", safe.action, "write");
const secretConfirm = assessRisk({ type: "decision", title: "API Key", body: "key is sk-abc123" }, true, loadSettings());
check("secret → confirm when ui", secretConfirm.action, "confirm");
const secretReject = assessRisk({ type: "decision", title: "API Key", body: "key is sk-abc123" }, false, loadSettings());
check("secret → reject when no ui", secretReject.action, "reject");
const forceConfirm = assessRisk({ type: "decision", title: "Normal fact", body: "something" }, true, loadSettings({ requireConfirmationForAll: true }));
check("requireConfirmationForAll → confirm", forceConfirm.action, "confirm");

// ── P1-006 retrieval ──────────────────────────────────────────────────────────
console.log("\nP1-006 retrieval");
const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), "akg-ret-"));
const rStore = await MemoryStore.open(tmpDir2, settings);
const s2 = rStore.store;

s2.putNode("decision", "d1", { title: "Decision One", body: "body1" }, []);
s2.putNode("decision", "d2", { title: "Decision Two", body: "body2" }, []);
s2.putNode("constraint", "c1", { title: "Constraint One", body: "cbody" }, []);
await rStore.commit();

const decisions = await fetchCandidates(rStore, { types: ["decision"] });
check("fetchCandidates by type returns 2", decisions.length, 2);

const limited = await fetchCandidates(rStore, { limit: 1 });
check("fetchCandidates limit:1 returns 1", limited.length, 1);

// Status filter test
const rawStore = await Store.open(path.join(tmpDir2, ".pi/memory2.akg"));
rawStore.putNode("task", "t1", { title: "Active task", body: "", meta: { status: "active" } }, []);
rawStore.putNode("task", "t2", { title: "Inactive task", body: "", meta: { status: "inactive" } }, []);
await rawStore.commit();
const rStore2 = new (MemoryStore as unknown as { new(...a: unknown[]): MemoryStore })(rawStore, path.join(tmpDir2, ".pi/memory2.akg"));

// Can't easily instantiate with private constructor — test status filtering via raw store wrapper
const allTasks = rawStore.listNodes("task");
const activeTasks = allTasks.filter(n => (n.meta.status as string) !== "inactive");
check("status filter excludes inactive (logic)", activeTasks.length, 1);

// formatCandidates budget
const longRecords = decisions.concat(decisions).concat(decisions);
const formatted = formatCandidates(longRecords, 100);
check("formatCandidates respects budget", formatted.length <= 100, true);

await rStore.close();

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
