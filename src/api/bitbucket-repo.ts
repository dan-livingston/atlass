import type { Transport } from "#/api/client.ts";
import type { RepoRef } from "#/util/parse.ts";

import { pathAndQuery } from "#/api/client.ts";

interface Paginated<T> {
	values?: T[];
	next?: string;
	size?: number;
}

export const BITBUCKET_WEB_ORIGIN = "https://bitbucket.org";
export const BITBUCKET_MAX_PAGELEN = 100;

export function repoPath(ref: RepoRef, resource: string): string {
	return `/2.0/repositories/${encodeURIComponent(ref.workspace)}/${encodeURIComponent(ref.repo)}/${resource}`;
}

export async function* walkPages<T>(client: Transport, firstPath: string): AsyncGenerator<T> {
	let path: string | null = firstPath;
	while (path) {
		const page: Paginated<T> = await client.getJson(path);
		for (const value of page.values ?? []) yield value;
		path = page.next ? pathAndQuery(page.next) : null;
	}
}

export interface CappedPage<T> {
	items: T[];
	total?: number;
	truncated: boolean;
}

export async function collectCapped<V, T>(
	client: Transport,
	first: string,
	cap: number,
	map: (value: V) => T,
): Promise<CappedPage<T>> {
	const items: T[] = [];
	let total: number | undefined;
	let path: string | null = first;
	while (path) {
		const page: Paginated<V> = await client.getJson(path);
		total ??= page.size;
		for (const value of page.values ?? []) {
			items.push(map(value));
			if (items.length >= cap) return { items, total, truncated: hasMore(page, total, cap) };
		}
		path = page.next ? pathAndQuery(page.next) : null;
	}
	return { items, total: total ?? items.length, truncated: false };
}

function hasMore<V>(page: Paginated<V>, total: number | undefined, cap: number): boolean {
	return total === undefined ? Boolean(page.next) : total > cap;
}

export async function collectPages<V, T>(
	client: Transport,
	first: string,
	limit: number,
	map: (value: V) => T,
): Promise<T[]> {
	return (await collectCapped<V, T>(client, first, limit, map)).items;
}
