import type { BitbucketSession } from "#/api/session.ts";
import type { Env, SessionEnv } from "#/env.ts";

import { openBitbucketSession, openSession } from "#/api/session.ts";
import { diskFiles } from "#/files/disk.ts";
import { openTerminal } from "#/terminal/open.ts";
import { ttyTerminal } from "#/terminal/tty.ts";

const SIGINT_EXIT_CODE = 130;

type Action<A extends unknown[]> = (...args: A) => Promise<void>;

export function bareAction<A extends unknown[]>(
	fn: (env: Env, ...args: A) => Promise<void>,
): Action<A> {
	return guarded((env, args) => fn(env, ...args));
}

export function jiraAction<A extends unknown[]>(
	fn: (env: SessionEnv, ...args: A) => Promise<void>,
): Action<A> {
	return guarded(async (env, args) => fn({ ...env, session: await openSession() }, ...args));
}

export function bitbucketAction<A extends unknown[]>(
	fn: (env: SessionEnv<BitbucketSession>, ...args: A) => Promise<void>,
): Action<A> {
	return guarded(async (env, args) =>
		fn({ ...env, session: await openBitbucketSession() }, ...args),
	);
}

function guarded<A extends unknown[]>(fn: (env: Env, args: A) => Promise<void>): Action<A> {
	return async (...args: A) => {
		try {
			await fn({ term: openTerminal(args, process.stdin), files: diskFiles() }, args);
		} catch (err) {
			fail(err);
		}
	};
}

export function fail(err: unknown): never {
	if (isPromptInterrupt(err)) process.exit(SIGINT_EXIT_CODE);
	ttyTerminal().err(`Error: ${err instanceof Error ? err.message : String(err)}`);
	process.exit(1);
}

function isPromptInterrupt(err: unknown): boolean {
	return err instanceof Error && err.name === "ExitPromptError";
}
