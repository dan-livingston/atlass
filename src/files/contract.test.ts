import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import type { Files } from "#/files.ts";

import { diskFiles } from "#/files/disk.ts";
import { memoryFiles } from "#/files/memory.ts";

const bytes = (text: string) => new TextEncoder().encode(text);

let dir: string;

beforeAll(async () => {
	dir = await mkdtemp(join(tmpdir(), "atlass-files-"));
});

afterAll(async () => {
	await rm(dir, { recursive: true, force: true });
});

const adapters: [string, () => Files, () => string][] = [
	["disk", diskFiles, () => join(dir, `${Math.random().toString(36).slice(2)}`)],
	["memory", memoryFiles, () => "/work"],
];

for (const [name, build, root] of adapters) {
	describe(name, () => {
		test("text written is text read back", async () => {
			const files = build();
			const path = join(root(), "note.md");
			await files.writeText(path, "hello");

			expect(await files.readText(path)).toBe("hello");
		});

		test("bytes written are bytes read back", async () => {
			const files = build();
			const path = join(root(), "shot.png");
			await files.writeBytes(path, bytes("png"));

			expect(await files.readBytes(path)).toEqual(bytes("png"));
		});

		test("a write creates the directories above it", async () => {
			const files = build();
			const path = join(root(), "deep", "deeper", "note.md");
			await files.writeText(path, "hello");

			expect(await files.readText(path)).toBe("hello");
		});

		test("size is the byte length, not the character count", async () => {
			const files = build();
			const path = join(root(), "note.md");
			await files.writeText(path, "café");

			expect(await files.size(path)).toBe(5);
		});

		test("reading a path that was never written throws", async () => {
			const files = build();

			await expect(files.readText(join(root(), "missing.md"))).rejects.toThrow();
		});
	});
}

test("memory files can be seeded and list what has been written", async () => {
	const files = memoryFiles({ "/in/source.md": "seeded" });
	await files.writeText("/out/note.md", "written");

	expect(await files.readText("/in/source.md")).toBe("seeded");
	expect(files.paths()).toEqual(["/in/source.md", "/out/note.md"]);
});
