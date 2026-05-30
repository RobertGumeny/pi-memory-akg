import path from "path";
import fs from "fs";
import { Store } from "akg-ts";
import type { Settings } from "./settings.js";

export class MemoryStore {
	private _store: Store;
	private _filePath: string;
	private _isOpen: boolean;

	private constructor(store: Store, filePath: string) {
		this._store = store;
		this._filePath = filePath;
		this._isOpen = true;
	}

	static async open(cwd: string, settings: Settings): Promise<MemoryStore> {
		const filePath = path.isAbsolute(settings.memoryFilePath)
			? settings.memoryFilePath
			: path.join(cwd, settings.memoryFilePath);

		const dir = path.dirname(filePath);
		try {
			fs.mkdirSync(dir, { recursive: true });
		} catch (err) {
			throw new Error(
				`[akg-memory] Cannot open memory file at ${filePath}: ${(err as Error).message}`,
			);
		}

		let store: Store;
		try {
			store = await Store.open(filePath);
		} catch (err) {
			throw new Error(
				`[akg-memory] Cannot open memory file at ${filePath}: ${(err as Error).message}`,
			);
		}

		return new MemoryStore(store, filePath);
	}

	get isOpen(): boolean {
		return this._isOpen;
	}

	get filePath(): string {
		return this._filePath;
	}

	// Internal access for tool modules — do not expose as part of the public contract
	get store(): Store {
		return this._store;
	}

	async compact(): Promise<void> {
		await this._store.compact();
	}

	async commit(): Promise<void> {
		await this._store.commit();
	}

	async close(): Promise<void> {
		if (!this._isOpen) return;
		await this._store.close();
		this._isOpen = false;
	}
}
