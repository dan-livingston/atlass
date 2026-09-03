import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { Files } from "#/files.ts";

async function makeRoom(path: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
}

export function diskFiles(): Files {
	return {
		async readText(path: string): Promise<string> {
			return readFile(path, "utf8");
		},
		async readBytes(path: string): Promise<Uint8Array> {
			const buffer = await readFile(path);
			return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
		},
		async size(path: string): Promise<number> {
			return (await stat(path)).size;
		},
		async writeText(path: string, text: string): Promise<void> {
			await makeRoom(path);
			await writeFile(path, text, "utf8");
		},
		async writeBytes(path: string, bytes: Uint8Array): Promise<void> {
			await makeRoom(path);
			await writeFile(path, bytes);
		},
	};
}
