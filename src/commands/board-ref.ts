import type { AtlassianSession } from "#/api/session.ts";

import { HttpError } from "#/api/http-error.ts";
import { listBoards } from "#/api/jira-boards.ts";
import { parseBoardId } from "#/util/parse.ts";

export async function withBoard<T>(
	session: AtlassianSession,
	ref: string,
	load: (id: number) => Promise<T>,
): Promise<T> {
	const id = await resolveBoardId(session, ref);
	try {
		return await load(id);
	} catch (err) {
		if (isMissingBoard(err, id)) throw unknownBoard(ref);
		throw err;
	}
}

async function resolveBoardId(session: AtlassianSession, ref: string): Promise<number> {
	const id = parseBoardId(ref);
	if (id !== null) return id;
	const name = ref.trim().toLowerCase();
	const matches = (await listBoards(session, session.site)).filter(
		(b) => b.name.toLowerCase() === name,
	);
	const [only, ...others] = matches;
	if (!only) throw unknownBoard(ref);
	if (others.length === 0) return only.id;
	const width = Math.max(...matches.map((b) => String(b.id).length));
	throw new Error(
		[
			`"${ref}" matches several boards. Use an id:`,
			...matches.map((b) => `  ${String(b.id).padEnd(width)}  ${b.name}`),
		].join("\n"),
	);
}

function isMissingBoard(err: unknown, id: number): boolean {
	return (
		err instanceof HttpError &&
		err.status === 404 &&
		err.path.startsWith(`/rest/agile/1.0/board/${id}/`)
	);
}

function unknownBoard(ref: string): Error {
	return new Error(`No board matches "${ref}". Run \`atlass jira boards\` to list boards.`);
}
