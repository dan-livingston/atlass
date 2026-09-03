import type { AtlassianSession, BitbucketSession } from "#/api/session.ts";
import type { Env, SessionEnv } from "#/env.ts";
import type { ScriptedOptions, ScriptedTerminal } from "#/terminal/scripted.ts";
import type { FakeTransport } from "#/test/session.ts";

import { scriptedTerminal } from "#/terminal/scripted.ts";
import { fakeBitbucketSession, fakeSession } from "#/test/session.ts";

export interface FakeEnv extends Env {
	term: ScriptedTerminal;
}

export interface FakeSessionEnv<Session> extends SessionEnv<Session> {
	term: ScriptedTerminal;
}

export function fakeEnv(scripted: ScriptedOptions = {}): FakeEnv {
	return { term: scriptedTerminal(scripted) };
}

export function fakeJiraEnv(
	spec: FakeTransport & { site?: string } = {},
	scripted: ScriptedOptions = {},
): FakeSessionEnv<AtlassianSession> {
	return { ...fakeEnv(scripted), session: fakeSession(spec) };
}

export function fakeBitbucketEnv(
	spec: Parameters<typeof fakeBitbucketSession>[0] = {},
	scripted: ScriptedOptions = {},
): FakeSessionEnv<BitbucketSession> {
	return { ...fakeEnv(scripted), session: fakeBitbucketSession(spec) };
}

export function routed(json: Record<string, unknown>): FakeTransport["getJson"] {
	return (path: string) => {
		if (!(path in json)) throw new Error(`unexpected GET ${path}`);
		return json[path];
	};
}
