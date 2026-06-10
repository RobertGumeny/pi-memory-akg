import { describe, it, expect } from "vitest";
import {
	slugify,
	normalizeTag,
	validateRefArg,
	parseCallerProvenance,
} from "../../src/tools/remember.js";
import { parseRef } from "../../src/ref.js";

describe("slugify", () => {
	it("lowercases and replaces whitespace runs with single hyphens", () => {
		expect(slugify("Use   AKG  Memory")).toBe("use-akg-memory");
	});

	it("strips characters outside [a-z0-9-]", () => {
		expect(slugify("Decision: use AKG (v2)!")).toBe("decision-use-akg-v2");
	});

	it("collapses runs of non-alphanumerics (incl. unicode) to a single hyphen", () => {
		expect(slugify("café — résumé")).toBe("caf-r-sum");
		expect(slugify("a // b")).toBe("a-b");
	});

	it("trims leading and trailing hyphens", () => {
		expect(slugify("!! Hello, World !!")).toBe("hello-world");
	});

	it("caps the slug at 60 characters without leaving a trailing hyphen", () => {
		expect(slugify("a".repeat(100))).toHaveLength(60);
		// 59 'a's + space would slice to "...a-" at 60; the trailing hyphen is trimmed.
		expect(slugify("a".repeat(59) + " bbb").endsWith("-")).toBe(false);
	});

	it("falls back to a hashed id when the title reduces to empty", () => {
		// All-punctuation titles slug to "" which akg-ts rejects as `empty node ID`.
		expect(slugify("!!! ???")).toMatch(/^note-[0-9a-f]{8}$/);
		expect(slugify("")).toMatch(/^note-[0-9a-f]{8}$/);
	});
});

describe("normalizeTag", () => {
	it("converts hyphens and capitals to a valid [a-z0-9_] component", () => {
		// akg-ts validateTag = validateComponent, so these would otherwise throw.
		expect(normalizeTag("tiny-notes")).toBe("tiny_notes");
		expect(normalizeTag("Auto-Capture")).toBe("auto_capture");
		expect(normalizeTag("durable")).toBe("durable");
	});

	it("collapses runs and trims edge underscores", () => {
		expect(normalizeTag("  user pref!! ")).toBe("user_pref");
	});

	it("returns null for a tag that reduces to empty so callers can drop it", () => {
		expect(normalizeTag("!!!")).toBeNull();
		expect(normalizeTag("")).toBeNull();
	});
});

describe("validateRefArg", () => {
	it("accepts a well-formed ref (hyphenated ids are allowed by validateNodeID)", () => {
		expect(validateRefArg("decision/use-akg-now")).toBeNull();
		expect(validateRefArg("file/src/index.ts")).toBeNull();
	});

	it("rejects a ref whose type component is not a valid [a-z0-9_] component", () => {
		expect(validateRefArg("tiny-notes/foo")).toContain('Invalid ref "tiny-notes/foo"');
	});

	it("rejects a ref with no slash or an empty id", () => {
		expect(validateRefArg("decision")).toContain("Invalid ref");
		expect(validateRefArg("decision/")).toContain("Invalid ref");
	});
});

describe("parseRef", () => {
	it("splits a type/id reference on the first slash", () => {
		expect(parseRef("decision/d1")).toEqual({ type: "decision", id: "d1" });
	});

	it("keeps slashes in the id portion", () => {
		expect(parseRef("file/src/index.ts")).toEqual({ type: "file", id: "src/index.ts" });
	});

	it("treats a string with no slash as a type with an empty id (malformed ref)", () => {
		expect(parseRef("decision")).toEqual({ type: "decision", id: "" });
	});

	it("splits a leading slash normally, yielding an empty type", () => {
		expect(parseRef("/d1")).toEqual({ type: "", id: "d1" });
	});
});

describe("parseCallerProvenance", () => {
	it("maps only the provided fields onto their metadata keys", () => {
		const meta = parseCallerProvenance({ cwd: "/repo", source: "tool" });
		expect(meta).toEqual({ cwd: "/repo", source: "tool" });
	});

	it("returns an empty object when nothing is provided", () => {
		expect(parseCallerProvenance({})).toEqual({});
	});
});
