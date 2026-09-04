import type { Transport } from "#/api/client.ts";
import type { IssueSearchParams } from "#/api/jira-types.ts";

import { HttpError } from "#/api/http-error.ts";
import { ACCOUNT_ID, matchUser, searchUsers } from "#/api/jira-users.ts";
import { values } from "#/api/query.ts";
import { parseSince } from "#/util/parse.ts";

export interface Filters {
	project?: string[];
	assignee?: string[];
	reporter?: string[];
	status?: string[];
	type?: string[];
	label?: string[];
	updated?: string;
	open?: boolean;
}

const FILTER_FLAGS = ["project", "assignee", "reporter", "status", "type", "label"] as const;
const DEFAULT_WINDOW = "30d";
const ISSUE_KEY = /^[A-Z][A-Z0-9]+-\d+$/i;

export function hasFilters(filters: Filters): boolean {
	return (
		FILTER_FLAGS.some((flag) => values(filters[flag]).length > 0) ||
		filters.updated !== undefined ||
		filters.open === true
	);
}

export function checkQuery(query: string | undefined, filters: Filters): void {
	if (query && ISSUE_KEY.test(query.trim())) {
		throw new Error(
			`"${query}" looks like an issue key. Run \`jira view ${query}\` to open it.`,
		);
	}
	if (!query && !hasFilters(filters)) {
		throw new Error(
			"Give a text query or at least one filter. `jira list` shows your open issues.",
		);
	}
}

export async function searchParams(
	client: Transport,
	query: string | undefined,
	filters: Filters,
	limit: number,
	nowMs: number,
): Promise<IssueSearchParams> {
	return {
		text: query,
		project: filters.project,
		assignee: await resolveUsers(client, filters.assignee),
		reporter: await resolveUsers(client, filters.reporter),
		status: filters.status,
		type: filters.type,
		label: filters.label,
		updatedSince: updatedFloor(query, filters, nowMs),
		open: filters.open,
		limit,
	};
}

function updatedFloor(
	query: string | undefined,
	filters: Filters,
	nowMs: number,
): string | undefined {
	if (filters.updated) return parseSince(filters.updated, nowMs);
	return query ? undefined : parseSince(DEFAULT_WINDOW, nowMs);
}

async function resolveUsers(
	client: Transport,
	given: string[] | undefined,
): Promise<string[] | undefined> {
	const list = values(given);
	if (list.length === 0) return undefined;
	const resolved: string[] = [];
	for (const who of list) {
		if (who === "me" || ACCOUNT_ID.test(who)) resolved.push(who);
		else resolved.push(matchUser(await searchUsers(client, who), who, "user"));
	}
	return resolved;
}

const FIELD_IN_MESSAGE = /for the field '([^']+)'/;

const createForm = (project?: string) => `jira fields ${project ?? "<project>"}`;

const DISCOVERY: Record<string, (project?: string) => string> = {
	project: () => "jira projects",
	status: (p) => (p ? `jira statuses --project ${p}` : "jira statuses"),
	issuetype: createForm,
	type: createForm,
};

export function searchHint(err: unknown, project: string[] | undefined): unknown {
	if (!(err instanceof HttpError) || err.status !== 400) return err;
	const field = FIELD_IN_MESSAGE.exec(err.message)?.[1]?.toLowerCase();
	const command = field ? DISCOVERY[field]?.(values(project)[0]) : undefined;
	return command ? new Error(`${err.message} Run \`${command}\` to see the options.`) : err;
}
