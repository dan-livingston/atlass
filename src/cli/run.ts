import type { BitbucketSession } from "#/api/session.ts";
import type { Env } from "#/env.ts";
import type { Terminal } from "#/terminal.ts";

import { openBitbucketSession, openSession } from "#/api/session.ts";
import { ttyTerminal } from "#/terminal/tty.ts";

const SIGINT_EXIT_CODE = 130;

export function run<A extends unknown[]>(
	fn: (term: Terminal, ...args: A) => Promise<void>,
): (...args: A) => Promise<void> {
	return async (...args: A) => {
		try {
			await fn(ttyTerminal(), ...args);
		} catch (err) {
			fail(err);
		}
	};
}

export function withJira<A extends unknown[]>(
	fn: (env: Env, ...args: A) => Promise<void>,
): (term: Terminal, ...args: A) => Promise<void> {
	return async (term: Terminal, ...args: A) =>
		fn({ session: await openSession(), term }, ...args);
}

export function withBitbucket<A extends unknown[]>(
	fn: (env: Env<BitbucketSession>, ...args: A) => Promise<void>,
): (term: Terminal, ...args: A) => Promise<void> {
	return async (term: Terminal, ...args: A) =>
		fn({ session: await openBitbucketSession(), term }, ...args);
}

export function fail(err: unknown): never {
	if (isPromptInterrupt(err)) process.exit(SIGINT_EXIT_CODE);
	ttyTerminal().err(`Error: ${err instanceof Error ? err.message : String(err)}`);
	process.exit(1);
}

function isPromptInterrupt(err: unknown): boolean {
	return err instanceof Error && err.name === "ExitPromptError";
}
