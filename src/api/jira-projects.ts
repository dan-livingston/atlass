import type { Transport } from "#/api/client.ts";
import type { ProjectSummary } from "#/api/jira-types.ts";

import { browseUrl } from "#/api/jira-url.ts";
import { allOffsetPages, OFFSET_PAGE_SIZE } from "#/api/offset-pages.ts";

interface ProjectResponse {
	id: string;
	key: string;
	name: string;
	projectTypeKey?: string;
}

export async function listProjects(
	client: Transport,
	site: string,
	query?: string,
): Promise<ProjectSummary[]> {
	const projects = await allOffsetPages<ProjectResponse>(
		client,
		(startAt) => `/rest/api/3/project/search?${projectSearchQuery(query, startAt)}`,
	);
	return projects.map((p) => ({
		key: p.key,
		name: p.name,
		id: p.id,
		type: p.projectTypeKey ?? "",
		url: browseUrl(site, p.key),
	}));
}

export function projectSearchQuery(query: string | undefined, startAt: number): string {
	const params = new URLSearchParams({
		orderBy: "key",
		maxResults: String(OFFSET_PAGE_SIZE),
		startAt: String(startAt),
	});
	if (query) params.set("query", query);
	return params.toString();
}
