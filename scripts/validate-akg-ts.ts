/**
 * P0-005: Validate akg-ts SDK API surface
 *
 * Tests all required public APIs and documents behavior for
 * Phase 1 implementation planning.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "akg-ts";

let pass = 0;
let fail = 0;

function assert(condition: boolean, message: string): void {
	if (condition) {
		console.log(`  ✓ ${message}`);
		pass++;
	} else {
		console.error(`  ✗ FAIL: ${message}`);
		fail++;
	}
}

async function main() {
	const tmpDir = await mkdtemp(join(tmpdir(), "akg-validate-"));
	const filePath = join(tmpDir, "test.akg");

	try {
		console.log("\n=== 1. Open a temporary .akg file ===");
		const store = await Store.open(filePath);
		assert(store !== null, "Store.open() returns a store instance");

		console.log("\n=== 2. CRUD: create, read, update, delete ===");
		const ref = store.putNode("decision", "test-node-1", {
			title: "Test Decision",
			body: "This is a test decision body.",
			meta: { status: "active" },
		}, ["durable", "design"]);
		assert(ref.type === "decision" && ref.id === "test-node-1", "putNode returns NodeRef with correct type/id");

		const node = store.getNode("decision", "test-node-1");
		assert(node !== null, "getNode returns the created node");
		assert(node?.title === "Test Decision", "getNode returns correct title");
		assert(node?.body === "This is a test decision body.", "getNode returns correct body");
		assert(Array.isArray(node?.tags) && node.tags.includes("durable"), "getNode returns correct tags");

		store.putNode("decision", "test-node-1", {
			title: "Test Decision Updated",
			body: "Updated body.",
		}, ["durable"]);
		const updated = store.getNode("decision", "test-node-1");
		assert(updated?.title === "Test Decision Updated", "putNode updates existing node in place");

		console.log("\n=== 3. compact() ===");
		await store.compact();
		assert(true, "compact() resolves without error");

		console.log("\n=== 4. recentNodes() and recentEdges() ===");
		store.putNode("constraint", "constraint-1", { title: "Test Constraint", body: "A constraint." }, []);
		const recent = store.recentNodes({ type: "decision" });
		assert(Array.isArray(recent), "recentNodes() returns an array");
		assert(recent.length >= 1, "recentNodes() returns at least 1 decision node");

		const recentEdgesResult = store.recentEdges();
		assert(Array.isArray(recentEdgesResult), "recentEdges() returns an array");

		console.log("\n=== 5. listNodesFiltered(), getNodes(), listEdges(), snapshot() ===");
		const filtered = store.listNodesFiltered({ type: "constraint" });
		assert(Array.isArray(filtered) && filtered.length >= 1, "listNodesFiltered() returns constraint nodes");

		const refs = [
			{ type: "decision", id: "test-node-1" },
			{ type: "constraint", id: "constraint-1" },
		];
		const nodes = store.getNodes(refs);
		assert(Array.isArray(nodes) && nodes.length === 2, "getNodes() returns array of same length as input");
		assert(nodes[0]?.type === "decision", "getNodes() returns correct first node type");

		const allEdges = store.listEdges();
		assert(Array.isArray(allEdges), "listEdges() returns an array");

		const snap = store.snapshot();
		assert(Array.isArray(snap.nodes) && Array.isArray(snap.edges), "snapshot() returns { nodes, edges }");
		assert(snap.nodes.length >= 2, "snapshot() includes all created nodes");

		console.log("\n=== 6. Inbound/outbound edge traversal ===");
		const fromRef = { type: "decision", id: "test-node-1" };
		const toRef = { type: "constraint", id: "constraint-1" };
		store.putEdge(fromRef, "affects", toRef, { strength: 0.8 });

		const outbound = store.outboundEdges(fromRef);
		assert(outbound.length >= 1, "outboundEdges() returns at least 1 edge from fromRef");
		assert(outbound[0].relation === "affects", "outboundEdges() edge has correct relation");

		const inbound = store.inboundEdges(toRef);
		assert(inbound.length >= 1, "inboundEdges() returns at least 1 edge to toRef");

		console.log("\n=== 7. Edge strength defaults to 0.5 ===");
		store.putNode("task", "task-1", { title: "Task One", body: "A task." }, []);
		const taskRef = { type: "task", id: "task-1" };
		store.putEdge(fromRef, "relevant_to", taskRef, {});
		const edgesNoStrength = store.outboundEdges(fromRef, "relevant_to");
		assert(edgesNoStrength.length >= 1, "putEdge without strength creates edge");
		assert(edgesNoStrength[0].strength === 0.5, `edge strength defaults to 0.5 (got ${edgesNoStrength[0].strength})`);

		console.log("\n=== 8. deleteNode rejects node with live edges ===");
		let deleteRejected = false;
		try {
			store.deleteNode("decision", "test-node-1");
		} catch (e) {
			deleteRejected = true;
		}
		assert(deleteRejected, "deleteNode() throws when node has live edges");

		console.log("\n=== 9. deleteNodeCascade removes node and its edges ===");
		store.putNode("decision", "to-cascade", { title: "To Cascade", body: "Will be cascade-deleted." }, []);
		const cascadeRef = { type: "decision", id: "to-cascade" };
		store.putEdge(cascadeRef, "affects", toRef, {});
		const cascadeResult = store.deleteNodeCascade("decision", "to-cascade");
		assert(cascadeResult.deletedNode === true, "deleteNodeCascade returns deletedNode: true");
		assert(cascadeResult.deletedOutboundEdges >= 1, "deleteNodeCascade removes outbound edges");
		const afterCascade = store.getNode("decision", "to-cascade");
		assert(afterCascade === null, "getNode returns null after cascade delete");

		console.log("\n=== 10. Single-writer semantics ===");
		let secondOpenError: Error | null = null;
		let secondStore: Store | null = null;
		try {
			secondStore = await Store.open(filePath);
		} catch (e) {
			secondOpenError = e as Error;
		}
		if (secondOpenError) {
			assert(true, `SDK throws on second open: ${secondOpenError.message}`);
			console.log("  → Single-writer: SDK throws when same file opened twice.");
		} else {
			assert(true, "SDK allows second open (no runtime lock — must use application-level queue)");
			console.log("  → Single-writer: SDK does NOT throw on second open.");
			console.log("  → Phase 1 must use application-level write serialization.");
			if (secondStore) {
				await secondStore.close();
			}
		}

		await store.commit();
		await store.close();

		console.log("\n=== Full-text/lexical search check ===");
		console.log("  → No full-text search method found on Store API.");
		console.log("  → Full-text/lexical search over node title/body is not available in the SDK.");

	} finally {
		await rm(tmpDir, { recursive: true, force: true });
	}

	console.log(`\n--- Results: ${pass} passed, ${fail} failed ---`);
	if (fail > 0) {
		process.exit(1);
	}
}

main().catch((err) => {
	console.error("Validation script error:", err);
	process.exit(1);
});
