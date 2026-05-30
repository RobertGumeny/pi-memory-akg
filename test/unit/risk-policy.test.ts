import { describe, it, expect } from "vitest";
import { assessRisk } from "../../src/risk-policy.js";
import { loadSettings } from "../../src/settings.js";

const clean = { type: "decision", title: "Use AKG", body: "AKG is durable memory." };

describe("assessRisk", () => {
	it("writes a clean record with a valid type and no flags", () => {
		expect(assessRisk(clean, true, loadSettings()).action).toBe("write");
	});

	it("always confirms when requireConfirmationForAll is set, short-circuiting other checks", () => {
		// A clean record that would otherwise write must still confirm.
		const r = assessRisk(clean, true, loadSettings({ requireConfirmationForAll: true }));
		expect(r.action).toBe("confirm");
	});

	describe("unrecognized type", () => {
		const bad = { type: "nonsense", title: "x", body: "y" };

		it("confirms when a UI is available", () => {
			expect(assessRisk(bad, true, loadSettings()).action).toBe("confirm");
		});

		it("rejects when no UI is available", () => {
			expect(assessRisk(bad, false, loadSettings()).action).toBe("reject");
		});

		it("treats an empty type as unrecognized", () => {
			expect(assessRisk({ type: "", title: "x", body: "y" }, true, loadSettings()).action).toBe(
				"confirm",
			);
		});
	});

	describe("low-confidence tags", () => {
		it.each(["confidence:low", "unverified", "inferred"])(
			"flags the %s tag",
			(tag) => {
				const rec = { ...clean, tags: [tag] };
				expect(assessRisk(rec, true, loadSettings()).action).toBe("confirm");
				expect(assessRisk(rec, false, loadSettings()).action).toBe("reject");
			},
		);

		it("does not flag ordinary tags", () => {
			expect(assessRisk({ ...clean, tags: ["durable", "design"] }, true, loadSettings()).action).toBe(
				"write",
			);
		});
	});

	describe("secret-like content", () => {
		const secrets: Array<[string, string]> = [
			["password keyword", "the password is hunter2patternlongenough"],
			["token keyword", "store this api_key somewhere"],
			["long opaque token", "abcdEFGH1234ijklMNOP5678"],
			["openai-style key", "sk-abcdefghij1234567890"],
			["github token", "ghp_abcdefghij1234567890"],
			["aws access key", "AKIAIOSFODNN7EXAMPLE"],
			["PEM private key", "-----BEGIN RSA PRIVATE KEY-----"],
		];

		it.each(secrets)("detects %s in the body", (_label, body) => {
			expect(assessRisk({ type: "decision", title: "note", body }, true, loadSettings()).action).toBe(
				"confirm",
			);
		});

		it("detects secrets in the title too", () => {
			expect(
				assessRisk({ type: "decision", title: "sk-abcdefghij1234567890", body: "" }, true, loadSettings())
					.action,
			).toBe("confirm");
		});

		it("rejects secrets when no UI is available", () => {
			expect(
				assessRisk({ type: "decision", title: "note", body: "sk-abcdefghij1234567890" }, false, loadSettings())
					.action,
			).toBe("reject");
		});

		it("does not flag ordinary prose or short strings", () => {
			expect(assessRisk({ type: "decision", title: "Short note", body: "We chose X over Y." }, true, loadSettings()).action).toBe(
				"write",
			);
		});
	});

	describe("precedence", () => {
		it("checks type before secrets (bad type + secret body confirms on type reason)", () => {
			const r = assessRisk({ type: "bogus", title: "t", body: "sk-abcdefghij1234567890" }, true, loadSettings());
			expect(r.action).toBe("confirm");
			expect(r.action === "confirm" && r.reason).toContain("not a recognized node type");
		});
	});
});
