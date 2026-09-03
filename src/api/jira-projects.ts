import type { AtlassianClient } from "#/api/client.ts";
import type { ProjectSummary } from "#/api/jira-types.ts";

import { browseUrl } from "#/api/jira-url.ts";

interface ProjectSearchResponse {
	isLast?: boolean;
	values?: {
		id: string;
		key: string;
		name: string;
		projectTypeKey?: string;
	}[];
}

const PROJECT_PAGE_SIZE = 50;

export async function listProjects(
	client: AtlassianClient,
	site: string,
	query?: string,
): Promise<ProjectSummary[]> {
	const projects: ProjectSummary[] = [];
	for (let startAt = 0; ;) {
		const res = await client.getJson<ProjectSearchResponse>(
			`/rest/api/3/project/search?${projectSearchQuery(query, startAt)}`,
		);
		const values = res.values ?? [];
		for (const p of values) {
			projects.push({
				key: p.key,
				name: p.name,
				id: p.id,
				type: p.projectTypeKey ?? "",
				url: browseUrl(site, p.key),
			});
		}
		if (res.isLast || values.length === 0) break;
		startAt += values.length;
	}
	return projects;
}

export function projectSearchQuery(query: string | undefined, startAt: number): string {
	const params = new URLSearchParams({
		orderBy: "key",
		maxResults: String(PROJECT_PAGE_SIZE),
		startAt: String(startAt),
	});
	if (query) params.set("query", query);
	return params.toString();
}
