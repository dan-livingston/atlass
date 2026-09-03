import type { BitbucketSession } from "#/api/session.ts";
import type { Env } from "#/env.ts";
import type { ScriptedOptions, ScriptedTerminal } from "#/terminal/scripted.ts";
import type { FakeTransport } from "#/test/session.ts";

import { scriptedTerminal } from "#/terminal/scripted.ts";
import { fakeBitbucketSession, fakeSession } from "#/test/session.ts";

export interface FakeEnv<Session> extends Env<Session> {
	term: ScriptedTerminal;
}

export function fakeEnv(
	spec: FakeTransport & { site?: string } = {},
	scripted: ScriptedOptions = {},
): FakeEnv<ReturnType<typeof fakeSession>> {
	return { session: fakeSession(spec), term: scriptedTerminal(scripted) };
}

export function fakeBitbucketEnv(
	spec: Parameters<typeof fakeBitbucketSession>[0] = {},
	scripted: ScriptedOptions = {},
): FakeEnv<BitbucketSession> {
	return { session: fakeBitbucketSession(spec), term: scriptedTerminal(scripted) };
}

export function routed(json: Record<string, unknown>): FakeTransport["getJson"] {
	return (path: string) => {
		if (!(path in json)) throw new Error(`unexpected GET ${path}`);
		return json[path];
	};
}
