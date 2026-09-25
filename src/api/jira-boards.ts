import type { Transport } from "#/api/client.ts";
import type { BoardSummary } from "#/api/jira-types.ts";

import { boardUrl } from "#/api/jira-url.ts";
import { allOffsetPages, OFFSET_PAGE_SIZE } from "#/api/offset-pages.ts";

interface BoardResponse {
	id: number;
	name: string;
	type: string;
	location?: { projectKey?: string };
}

export async function listBoards(client: Transport, site: string): Promise<BoardSummary[]> {
	const boards = await allOffsetPages<BoardResponse>(
		client,
		(startAt) => `/rest/agile/1.0/board?startAt=${startAt}&maxResults=${OFFSET_PAGE_SIZE}`,
	);
	return boards.map((b) => ({
		id: b.id,
		name: b.name,
		type: b.type,
		project: b.location?.projectKey ?? null,
		url: boardUrl(site, b.id),
	}));
}
