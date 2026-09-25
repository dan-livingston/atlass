import type { Transport } from "#/api/client.ts";
import type { BoardDetail, BoardEstimation, StatusSummary } from "#/api/jira-types.ts";

import { HttpError } from "#/api/http-error.ts";
import { statusesById } from "#/api/jira-statuses.ts";
import { boardUrl } from "#/api/jira-url.ts";

interface BoardConfigurationResponse {
	id: number;
	name: string;
	type: string;
	filter: { id: string };
	subQuery?: { query?: string };
	columnConfig?: { columns?: { name: string; statuses?: { id: string }[] }[] };
	estimation?: { type?: string; field?: { fieldId: string; displayName: string } };
}

interface FilterResponse {
	jql?: string;
}

export async function fetchBoard(
	client: Transport,
	site: string,
	id: number,
): Promise<BoardDetail> {
	const [config, statuses] = await Promise.all([
		client.getJson<BoardConfigurationResponse>(`/rest/agile/1.0/board/${id}/configuration`),
		statusesById(client),
	]);
	const statusFor = (statusId: string): StatusSummary =>
		statuses.get(statusId) ?? { id: statusId, name: statusId, category: "", categoryKey: "" };
	return {
		id: config.id,
		name: config.name,
		type: config.type,
		url: boardUrl(site, config.id),
		estimation: estimationOf(config),
		filter: {
			id: config.filter.id,
			jql: await visibleFilterJql(client, config.filter.id),
			subQuery: config.subQuery?.query || null,
		},
		columns: (config.columnConfig?.columns ?? []).map((c) => ({
			name: c.name,
			statuses: (c.statuses ?? []).map((s) => statusFor(s.id)),
		})),
	};
}

async function visibleFilterJql(client: Transport, filterId: string): Promise<string | null> {
	try {
		return (await client.getJson<FilterResponse>(`/rest/api/3/filter/${filterId}`)).jql ?? null;
	} catch (err) {
		if (err instanceof HttpError && err.status === 404) return null;
		throw err;
	}
}

function estimationOf(config: BoardConfigurationResponse): BoardEstimation | null {
	const field = config.estimation?.type === "field" ? config.estimation.field : undefined;
	return field ? { fieldId: field.fieldId, fieldName: field.displayName } : null;
}
