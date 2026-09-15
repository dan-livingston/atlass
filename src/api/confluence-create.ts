import type { AdfNode } from "#/adf/types.ts";
import type { Transport } from "#/api/client.ts";

interface SpacesResponse {
	results: { id: string; key: string }[];
}

interface CreatedResponse {
	id: string;
	version?: { number?: number };
}

export interface NewPage {
	spaceId: string;
	parentId?: string;
	title: string;
	body: AdfNode;
}

export interface CreatedPage {
	id: string;
	version: number;
}

export async function findSpaceId(client: Transport, key: string): Promise<string | null> {
	const res = await client.getJson<SpacesResponse>(
		`/wiki/api/v2/spaces?keys=${encodeURIComponent(key)}`,
	);
	return res.results[0]?.id ?? null;
}

export async function createPage(client: Transport, page: NewPage): Promise<CreatedPage> {
	const res = await client.postJson<CreatedResponse>("/wiki/api/v2/pages", {
		spaceId: page.spaceId,
		status: "current",
		title: page.title,
		...(page.parentId ? { parentId: page.parentId } : {}),
		body: { representation: "atlas_doc_format", value: JSON.stringify(page.body) },
	});
	return { id: res.id, version: res.version?.number ?? 1 };
}
