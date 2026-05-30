/**
 * Parse a "type/id" reference string into its components.
 *
 * Splits on the first slash. If there is no slash at all, the whole string is
 * treated as the type with an empty id — callers use the empty id to detect a
 * malformed ref. A leading slash splits normally, yielding an empty type.
 */
export function parseRef(id: string): { type: string; id: string } {
	const slash = id.indexOf("/");
	if (slash < 0) return { type: id, id: "" };
	return { type: id.slice(0, slash), id: id.slice(slash + 1) };
}
