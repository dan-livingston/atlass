import type { AtlassianClient } from "#/api/client.ts";
import type { RepoRef } from "#/util/parse.ts";

import { pathAndQuery } from "#/api/client.ts";

interface Paginated<T> {
	values?: T[];
	next?: string;
}

export const BITBUCKET_WEB_ORIGIN = "https://bitbucket.org";
export const BITBUCKET_MAX_PAGELEN = 100;

export function repoPath(ref: RepoRef, resource: string): string {
	return `/2.0/repositories/${encodeURIComponent(ref.workspace)}/${encodeURIComponent(ref.repo)}/${resource}`;
}

export async function* walkPages<T>(client: AtlassianClient, firstPath: string): AsyncGenerator<T> {
	let path: string | null = firstPath;
	while (path) {
		const page: Paginated<T> = await client.getJson(path);
		for (const value of page.values ?? []) yield value;
		path = page.next ? pathAndQuery(page.next) : null;
	}
}

export async function collectPages<V, T>(
	client: AtlassianClient,
	first: string,
	limit: number,
	map: (value: V) => T,
): Promise<T[]> {
	const out: T[] = [];
	for await (const value of walkPages<V>(client, first)) {
		out.push(map(value));
		if (out.length >= limit) break;
	}
	return out;
}
