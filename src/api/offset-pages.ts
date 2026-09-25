import type { Transport } from "#/api/client.ts";

interface OffsetPage<T> {
	isLast?: boolean;
	values?: T[];
}

export const OFFSET_PAGE_SIZE = 50;

export async function allOffsetPages<T>(
	client: Transport,
	pathAt: (startAt: number) => string,
): Promise<T[]> {
	const all: T[] = [];
	for (let startAt = 0; ;) {
		const res = await client.getJson<OffsetPage<T>>(pathAt(startAt));
		const values = res.values ?? [];
		all.push(...values);
		if (res.isLast || values.length === 0) return all;
		startAt += values.length;
	}
}
