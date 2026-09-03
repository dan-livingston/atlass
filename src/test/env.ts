import type { AtlassianSession, BitbucketSession } from "#/api/session.ts";
import type { Env, SessionEnv } from "#/env.ts";
import type { FileSeed, MemoryFiles } from "#/files/memory.ts";
import type { ScriptedOptions, ScriptedTerminal } from "#/terminal/scripted.ts";
import type { FakeTransport } from "#/test/session.ts";

import { memoryFiles } from "#/files/memory.ts";
import { scriptedTerminal } from "#/terminal/scripted.ts";
import { fakeBitbucketSession, fakeSession } from "#/test/session.ts";

export interface FakeEnv extends Env {
	term: ScriptedTerminal;
	files: MemoryFiles;
}

export interface FakeSessionEnv<Session> extends SessionEnv<Session> {
	term: ScriptedTerminal;
	files: MemoryFiles;
}

export function fakeEnv(scripted: ScriptedOptions = {}, seed: FileSeed = {}): FakeEnv {
	return { term: scriptedTerminal(scripted), files: memoryFiles(seed) };
}

export function fakeJiraEnv(
	spec: FakeTransport & { site?: string } = {},
	scripted: ScriptedOptions = {},
	seed: FileSeed = {},
): FakeSessionEnv<AtlassianSession> {
	return { ...fakeEnv(scripted, seed), session: fakeSession(spec) };
}

export function fakeBitbucketEnv(
	spec: Parameters<typeof fakeBitbucketSession>[0] = {},
	scripted: ScriptedOptions = {},
	seed: FileSeed = {},
): FakeSessionEnv<BitbucketSession> {
	return { ...fakeEnv(scripted, seed), session: fakeBitbucketSession(spec) };
}

export function routed(json: Record<string, unknown>): FakeTransport["getJson"] {
	return (path: string) => {
		if (!(path in json)) throw new Error(`unexpected GET ${path}`);
		return json[path];
	};
}
