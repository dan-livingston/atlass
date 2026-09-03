import type { Transport } from "#/api/client.ts";
import type { StatusSummary } from "#/api/jira-types.ts";

import { HttpError } from "#/api/http-error.ts";

interface StatusResponse {
	id: string;
	name: string;
	statusCategory?: { key?: string; name?: string };
}

interface IssueTypeStatusesResponse {
	statuses?: StatusResponse[];
}

export async function listStatuses(client: Transport, project?: string): Promise<StatusSummary[]> {
	const raw = project
		? await fetchProjectStatuses(client, project)
		: await client.getJson<StatusResponse[]>("/rest/api/3/status");
	return dedupeAndSortStatuses(raw.map(toStatusSummary));
}

async function fetchProjectStatuses(client: Transport, project: string): Promise<StatusResponse[]> {
	let groups: IssueTypeStatusesResponse[];
	try {
		groups = await client.getJson<IssueTypeStatusesResponse[]>(
			`/rest/api/3/project/${encodeURIComponent(project)}/statuses`,
		);
	} catch (err) {
		if (err instanceof HttpError && err.status === 404) {
			throw new Error(`No project found with key "${project}".`);
		}
		throw err;
	}
	return groups.flatMap((g) => g.statuses ?? []);
}

function toStatusSummary(s: StatusResponse): StatusSummary {
	return {
		name: s.name,
		id: s.id,
		category: s.statusCategory?.name ?? "",
		categoryKey: s.statusCategory?.key ?? "",
	};
}

const CATEGORY_ORDER: Record<string, number> = { new: 0, indeterminate: 1, done: 2 };
const UNKNOWN_CATEGORY_RANK = Object.keys(CATEGORY_ORDER).length;

export function dedupeAndSortStatuses(statuses: StatusSummary[]): StatusSummary[] {
	const byNameCategory = new Map<string, StatusSummary>();
	for (const s of statuses) {
		const key = `${s.name}\0${s.categoryKey}`;
		if (!byNameCategory.has(key)) byNameCategory.set(key, s);
	}
	return [...byNameCategory.values()].sort((a, b) => {
		const rank = (s: StatusSummary) => CATEGORY_ORDER[s.categoryKey] ?? UNKNOWN_CATEGORY_RANK;
		return rank(a) - rank(b) || a.name.localeCompare(b.name);
	});
}
