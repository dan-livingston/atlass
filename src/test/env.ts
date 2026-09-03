import type { AtlassianSession, BitbucketSession } from "#/api/session.ts";
import type { Env, SessionEnv } from "#/env.ts";
import type { FileSeed, MemoryFiles } from "#/files/memory.ts";
import type { Profile } from "#/profile.ts";
import type { ProfileSeed } from "#/profile/memory.ts";
import type { ScriptedOptions, ScriptedTerminal } from "#/terminal/scripted.ts";
import type { FakeTransport } from "#/test/session.ts";

import { memoryFiles } from "#/files/memory.ts";
import { memoryProfile } from "#/profile/memory.ts";
import { scriptedTerminal } from "#/terminal/scripted.ts";
import { fakeBitbucketSession, fakeSession } from "#/test/session.ts";

export interface FakeOptions extends ScriptedOptions {
	files?: FileSeed;
	profile?: ProfileSeed;
}

export interface FakeEnv extends Env {
	term: ScriptedTerminal;
	files: MemoryFiles;
	profile: Profile;
}

export interface FakeSessionEnv<Session> extends SessionEnv<Session> {
	term: ScriptedTerminal;
	files: MemoryFiles;
	profile: Profile;
}

export function fakeEnv(options: FakeOptions = {}): FakeEnv {
	return {
		term: scriptedTerminal(options),
		files: memoryFiles(options.files),
		profile: memoryProfile(options.profile),
	};
}

export function fakeJiraEnv(
	spec: FakeTransport & { site?: string } = {},
	options: FakeOptions = {},
): FakeSessionEnv<AtlassianSession> {
	return { ...fakeEnv(options), session: fakeSession(spec) };
}

export function fakeBitbucketEnv(
	spec: Parameters<typeof fakeBitbucketSession>[0] = {},
	options: FakeOptions = {},
): FakeSessionEnv<BitbucketSession> {
	return { ...fakeEnv(options), session: fakeBitbucketSession(spec) };
}

export function routed(json: Record<string, unknown>): FakeTransport["getJson"] {
	return (path: string) => {
		if (!(path in json)) throw new Error(`unexpected GET ${path}`);
		return json[path];
	};
}
