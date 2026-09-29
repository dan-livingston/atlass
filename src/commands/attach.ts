import { basename } from "node:path";

import type { Attached } from "#/api/attachments.ts";
import type { Files } from "#/files.ts";
import type { Terminal } from "#/terminal.ts";

export interface AttachOptions {
	json?: boolean;
}

export interface LocalFile {
	filename: string;
	bytes: Uint8Array;
}

export type Upload = (file: LocalFile) => Promise<Attached>;

export async function readLocal(files: Files, paths: string[]): Promise<LocalFile[]> {
	const read = await Promise.all(
		paths.map(async (path) => ({
			path,
			bytes: await files.readBytes(path).catch(() => undefined),
		})),
	);
	const unreadable = read.filter((r) => !r.bytes).map((r) => r.path);
	if (unreadable.length > 0) throw new Error(`Cannot read ${unreadable.join(", ")}.`);
	return read.map((r) => ({ filename: basename(r.path), bytes: r.bytes! }));
}

export async function attachAll(
	term: Terminal,
	target: string,
	local: LocalFile[],
	options: AttachOptions,
	upload: Upload,
): Promise<void> {
	const attached: Attached[] = [];
	for (const file of local) {
		term.err(`Uploading ${file.filename} ...`);
		try {
			attached.push(await upload(file));
		} catch (err) {
			if (attached.length > 0) term.err(`Already attached to ${target}: ${names(attached)}.`);
			throw err;
		}
	}
	if (options.json) term.json(attached);
	else term.out(`Attached ${names(attached)} to ${target}.`);
}

function names(attached: Attached[]): string {
	return attached.map((a) => a.filename).join(", ");
}
