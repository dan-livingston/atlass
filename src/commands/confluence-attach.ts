import type { Transport } from "#/api/client.ts";
import type { AttachOptions, LocalFile } from "#/commands/attach.ts";
import type { SessionEnv } from "#/env.ts";

import { attachToPage, listAttachments } from "#/api/confluence-attachments.ts";
import { attachAll, readLocal } from "#/commands/attach.ts";
import { PAGE_REF } from "#/commands/page-ref.ts";
import { resolveRef } from "#/commands/resolve-ref.ts";

export interface PageAttachOptions extends AttachOptions {
	comment?: string;
}

export async function confluenceAttach(
	{ session, term, files }: SessionEnv,
	arg: string,
	paths: string[],
	options: PageAttachOptions,
): Promise<void> {
	const id = await resolveRef(term.ask, arg, PAGE_REF);
	const local = await readLocal(files, paths);
	await refuseClashes(session, id, local);
	await attachAll(term, `page ${id}`, local, options, (file) =>
		attachToPage(session, id, file.filename, file.bytes, options.comment),
	);
}

async function refuseClashes(client: Transport, id: string, local: LocalFile[]): Promise<void> {
	const names = local.map((f) => f.filename);
	const repeated = names.filter((name, i) => names.indexOf(name) !== i);
	if (repeated.length > 0) {
		throw new Error(`More than one file is named ${unique(repeated).join(", ")}.`);
	}
	const existing = new Set((await listAttachments(client, id)).map((a) => a.filename));
	const clashes = names.filter((name) => existing.has(name));
	if (clashes.length > 0) {
		throw new Error(`${clashes.join(", ")} already attached to page ${id}.`);
	}
}

function unique(names: string[]): string[] {
	return [...new Set(names)];
}
