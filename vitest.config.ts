import { defineConfig } from "vitest/config";

// Two independently-runnable projects so the suites stay separate:
//   unit        — pure business logic, fakes only, no filesystem/akg-ts I/O
//   integration — tool handlers against a real akg-ts store in a temp dir
// See test/testing-strategy.md for the philosophy.
export default defineConfig({
	test: {
		projects: [
			{
				test: {
					name: "unit",
					include: ["test/unit/**/*.test.ts"],
				},
			},
			{
				test: {
					name: "integration",
					include: ["test/integration/**/*.test.ts"],
				},
			},
		],
	},
});
