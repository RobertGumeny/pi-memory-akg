export interface Settings {
	hintEnabled: boolean;
	hintBudget: number;
	toolResultBudget: number;
	requireConfirmationForAll: boolean;
	memoryFilePath: string;
}

const DEFAULTS: Settings = {
	hintEnabled: true,
	hintBudget: 400,
	toolResultBudget: 6000,
	requireConfirmationForAll: false,
	memoryFilePath: ".pi/memory.akg",
};

export function loadSettings(overrides?: Partial<Settings>): Settings {
	return { ...DEFAULTS, ...overrides };
}
