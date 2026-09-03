import type { Files } from "#/files.ts";

export interface MemoryFiles extends Files {
	paths(): string[];
}

export type FileSeed = Record<string, string | Uint8Array>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function asBytes(data: string | Uint8Array): Uint8Array {
	return typeof data === "string" ? encoder.encode(data) : data;
}

export function memoryFiles(seed: FileSeed = {}): MemoryFiles {
	const store = new Map<string, Uint8Array>(
		Object.entries(seed).map(([path, data]) => [path, asBytes(data)]),
	);

	function take(path: string): Uint8Array {
		const bytes = store.get(path);
		if (!bytes) throw new Error(`No such file: ${path}`);
		return bytes;
	}

	return {
		async readText(path: string): Promise<string> {
			return decoder.decode(take(path));
		},
		async readBytes(path: string): Promise<Uint8Array> {
			return take(path);
		},
		async size(path: string): Promise<number> {
			return take(path).byteLength;
		},
		async writeText(path: string, text: string): Promise<void> {
			store.set(path, encoder.encode(text));
		},
		async writeBytes(path: string, bytes: Uint8Array): Promise<void> {
			store.set(path, bytes);
		},
		paths(): string[] {
			return [...store.keys()].sort();
		},
	};
}
