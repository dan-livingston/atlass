import type { AtlassianClient } from "#/api/client.ts";
import type {
	IssueList,
	IssueListParams,
	IssueSearchParams,
	IssueSummary,
} from "#/api/jira-types.ts";

import { browseUrl } from "#/api/jira-url.ts";
import { decodeEntities } from "#/util/html.ts";

const RECENT_ISSUES_CLAUSE = "updated >= -30d";

interface SearchIssueResponse {
	key: string;
	fields?: {
		summary?: string;
		status?: { name?: string; statusCategory?: { key?: string } };
		updated?: string;
	};
}

interface SearchResponse {
	issues?: SearchIssueResponse[];
	isLast?: boolean;
	nextPageToken?: string;
}

const SEARCH_FIELDS = "summary,status,updated";

export async function searchIssues(
	client: AtlassianClient,
	site: string,
	params: IssueSearchParams,
): Promise<IssueSummary[]> {
	const res = await fetchSearchPage(client, buildJql(params), params.limit);
	return (res.issues ?? []).map((i) => toIssueSummary(site, i));
}

async function fetchSearchPage(
	client: AtlassianClient,
	jql: string,
	maxResults: number,
	nextPageToken?: string,
): Promise<SearchResponse> {
	const query = new URLSearchParams({
		jql,
		maxResults: String(maxResults),
		fields: SEARCH_FIELDS,
	});
	if (nextPageToken) query.set("nextPageToken", nextPageToken);
	return client.getJson<SearchResponse>(`/rest/api/3/search/jql?${query.toString()}`);
}

function toIssueSummary(site: string, i: SearchIssueResponse): IssueSummary {
	return {
		key: i.key,
		status: i.fields?.status?.name ?? "",
		statusCategory: i.fields?.status?.statusCategory?.key ?? "",
		summary: decodeEntities(i.fields?.summary ?? ""),
		updated: i.fields?.updated ?? "",
		url: browseUrl(site, i.key),
	};
}

export function buildJql(params: IssueSearchParams): string {
	if (params.jql) return params.jql;
	const clauses: string[] = [];
	if (params.project) clauses.push(`project = ${jqlStringLiteral(params.project)}`);
	if (params.assignee) {
		clauses.push(
			params.assignee === "me"
				? "assignee = currentUser()"
				: `assignee = ${jqlStringLiteral(params.assignee)}`,
		);
	}
	if (params.status) clauses.push(`status = ${jqlStringLiteral(params.status)}`);
	if (params.text) clauses.push(`text ~ ${jqlStringLiteral(params.text)}`);
	if (clauses.length === 0) clauses.push(RECENT_ISSUES_CLAUSE);
	return `${clauses.join(" AND ")} ORDER BY updated DESC`;
}

const OPEN_CLAUSE = "statusCategory != Done";

export function buildListJql(params: IssueListParams): string {
	const clauses = ["assignee = currentUser()"];
	if (params.project) clauses.push(`project = ${jqlStringLiteral(params.project)}`);
	clauses.push(params.all ? `(${OPEN_CLAUSE} OR ${RECENT_ISSUES_CLAUSE})` : OPEN_CLAUSE);
	return `${clauses.join(" AND ")} ORDER BY updated DESC`;
}

const LIST_PAGE_SIZE = 100;
const LIST_CAP = 500;

export async function listAssignedIssues(
	client: AtlassianClient,
	site: string,
	params: IssueListParams,
): Promise<IssueList> {
	const jql = buildListJql(params);
	const issues: IssueSummary[] = [];
	let nextPageToken: string | undefined;
	for (;;) {
		const room = LIST_CAP - issues.length;
		const res = await fetchSearchPage(
			client,
			jql,
			Math.min(LIST_PAGE_SIZE, room),
			nextPageToken,
		);
		const page = res.issues ?? [];
		issues.push(...page.map((i) => toIssueSummary(site, i)));
		if (res.isLast || !res.nextPageToken || page.length === 0) {
			return { issues, truncated: false };
		}
		if (issues.length >= LIST_CAP) return { issues, truncated: true };
		nextPageToken = res.nextPageToken;
	}
}

const LIST_CATEGORY_ORDER: Record<string, number> = { indeterminate: 0, new: 1, done: 2 };
const LIST_UNKNOWN_CATEGORY_RANK = Object.keys(LIST_CATEGORY_ORDER).length;

export function sortByCategoryThenUpdated(issues: IssueSummary[]): IssueSummary[] {
	const rank = (i: IssueSummary) =>
		LIST_CATEGORY_ORDER[i.statusCategory] ?? LIST_UNKNOWN_CATEGORY_RANK;
	const updatedMs = (i: IssueSummary) => Date.parse(i.updated) || 0;
	return [...issues].sort((a, b) => rank(a) - rank(b) || updatedMs(b) - updatedMs(a));
}

function jqlStringLiteral(value: string): string {
	return `"${value.replace(/(["\\])/g, "\\$1")}"`;
}
