import type { AttachOptions } from "#/commands/attach.ts";
import type { SessionEnv } from "#/env.ts";

import { attachToIssue } from "#/api/jira-attachments.ts";
import { attachAll, readLocal } from "#/commands/attach.ts";
import { ISSUE_REF } from "#/commands/jira.ts";
import { resolveRef } from "#/commands/resolve-ref.ts";

export async function jiraAttach(
	{ session, term, files }: SessionEnv,
	arg: string,
	paths: string[],
	options: AttachOptions,
): Promise<void> {
	const key = await resolveRef(term.ask, arg, ISSUE_REF);
	const local = await readLocal(files, paths);
	await attachAll(term, key, local, options, (file) =>
		attachToIssue(session, key, file.filename, file.bytes),
	);
}
