import type { Transport } from "#/api/client.ts";

function favouritePath(id: string): string {
	return `/wiki/rest/api/relation/favourite/from/user/current/to/content/${encodeURIComponent(id)}`;
}

export async function starPage(client: Transport, id: string): Promise<void> {
	await client.putNoContent(favouritePath(id), undefined);
}

export async function unstarPage(client: Transport, id: string): Promise<void> {
	await client.deleteNoContent(favouritePath(id));
}
