import fs from "fs";
import os from "os";
import path from "path";
import { MemoryStore } from "../../src/memory-store.js";
import { loadSettings, type Settings } from "../../src/settings.js";

/**
 * Integration-test helper: open a real MemoryStore (backed by an akg-ts file)
 * inside a throwaway temp directory. Callers must pass the returned `cleanup`
 * to afterEach/afterAll so no temp dirs leak.
 */
export interface TempStore {
	store: MemoryStore;
	dir: string;
	cleanup: () => Promise<void>;
}

export async function makeTempStore(overrides?: Partial<Settings>): Promise<TempStore> {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "akg-it-"));
	const settings = loadSettings(overrides);
	const store = await MemoryStore.open(dir, settings);
	return {
		store,
		dir,
		cleanup: async () => {
			await store.close().catch(() => {});
			fs.rmSync(dir, { recursive: true, force: true });
		},
	};
}
