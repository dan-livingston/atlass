import type { SessionEnv } from "#/env.ts";

import { starPage, unstarPage } from "#/api/confluence-favourites.ts";
import { pageIdOrFile } from "#/commands/page-ref.ts";

export async function confluenceStar(env: SessionEnv, arg: string | undefined): Promise<void> {
	await starById(env, await pageIdOrFile(env, arg));
}

export async function starById({ session, term }: SessionEnv, id: string): Promise<void> {
	await starPage(session, id);
	term.out(`Starred page ${id}.`);
}

export async function confluenceUnstar(env: SessionEnv, arg: string | undefined): Promise<void> {
	const id = await pageIdOrFile(env, arg);
	await unstarPage(env.session, id);
	env.term.out(`Unstarred page ${id}.`);
}
