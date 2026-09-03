import type { Transport } from "#/api/client.ts";
import type { AtlassianSession, BitbucketSession } from "#/api/session.ts";

export interface FakeTransport {
	getJson?: (path: string) => unknown;
	postJson?: (path: string, body: unknown) => unknown;
	putJson?: (path: string, body: unknown) => unknown;
	putNoContent?: (path: string, body: unknown) => void | Promise<void>;
	postMultipart?: (path: string, filename: string, bytes: Uint8Array) => unknown;
	getBinary?: (urlOrPath: string) => Uint8Array | Promise<Uint8Array>;
}

function unexpected(verb: string, path: string): Error {
	return new Error(`unexpected ${verb} ${path}`);
}

function fakeTransport(spec: FakeTransport): Transport {
	return {
		async getJson<T>(path: string): Promise<T> {
			if (!spec.getJson) throw unexpected("GET", path);
			return (await spec.getJson(path)) as T;
		},
		async postJson<T>(path: string, body: unknown): Promise<T> {
			if (!spec.postJson) throw unexpected("POST", path);
			return (await spec.postJson(path, body)) as T;
		},
		async putJson<T>(path: string, body: unknown): Promise<T> {
			if (!spec.putJson) throw unexpected("PUT", path);
			return (await spec.putJson(path, body)) as T;
		},
		async putNoContent(path: string, body: unknown): Promise<void> {
			if (!spec.putNoContent) throw unexpected("PUT", path);
			await spec.putNoContent(path, body);
		},
		async postMultipart<T>(path: string, filename: string, bytes: Uint8Array): Promise<T> {
			if (!spec.postMultipart) throw unexpected("POST", path);
			return (await spec.postMultipart(path, filename, bytes)) as T;
		},
		async getBinary(urlOrPath: string): Promise<Uint8Array> {
			if (!spec.getBinary) throw unexpected("GET", urlOrPath);
			return spec.getBinary(urlOrPath);
		},
	};
}

const FAKE_SITE = "https://acme.atlassian.net";

export function fakeSession(spec: FakeTransport & { site?: string } = {}): AtlassianSession {
	return { ...fakeTransport(spec), site: spec.site ?? FAKE_SITE };
}

export function fakeBitbucketSession(
	spec: FakeTransport & Partial<Omit<BitbucketSession, keyof Transport>> = {},
): BitbucketSession {
	return {
		...fakeTransport(spec),
		workspace: spec.workspace ?? "ws",
		defaultRepo: spec.defaultRepo,
		uuid: spec.uuid,
	};
}
