import type { Transport } from "#/api/client.ts";
import type {
	IssueList,
	IssueListParams,
	IssueSearchParams,
	IssueSummary,
} from "#/api/jira-types.ts";

import { browseUrl } from "#/api/jira-url.ts";
import { inClause, joinClauses, quote, userClause } from "#/api/query.ts";
import { decodeEntities } from "#/util/html.ts";

const RECENT_ISSUES_CLAUSE = "updated >= -30d";
const OPEN_CLAUSE = "statusCategory != Done";

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
	client: Transport,
	site: string,
	params: IssueSearchParams,
): Promise<IssueSummary[]> {
	return searchIssuesByJql(client, site, buildJql(params), params.limit);
}

export async function searchIssuesByJql(
	client: Transport,
	site: string,
	jql: string,
	limit: number,
): Promise<IssueSummary[]> {
	const res = await fetchSearchPage(client, jql, limit);
	return (res.issues ?? []).map((i) => toIssueSummary(site, i));
}

async function fetchSearchPage(
	client: Transport,
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

const ISSUE_ORDER = "updated DESC";

export function buildJql(params: IssueSearchParams): string {
	const clauses = [
		inClause("project", params.project),
		inClause("type", params.type),
		inClause("status", params.status),
		params.open ? OPEN_CLAUSE : null,
		userClause("assignee", params.assignee),
		userClause("reporter", params.reporter),
		inClause("labels", params.label),
		params.updatedSince ? `updated >= ${quote(params.updatedSince)}` : null,
		params.text ? `text ~ ${quote(params.text)}` : null,
	].filter((c) => c !== null);
	if (clauses.length === 0) clauses.push(RECENT_ISSUES_CLAUSE);
	return joinClauses(clauses, ISSUE_ORDER);
}

export function buildListJql(params: IssueListParams): string {
	return joinClauses(
		[
			"assignee = currentUser()",
			params.project ? `project = ${quote(params.project)}` : null,
			params.all ? `(${OPEN_CLAUSE} OR ${RECENT_ISSUES_CLAUSE})` : OPEN_CLAUSE,
		],
		ISSUE_ORDER,
	);
}

const LIST_PAGE_SIZE = 100;
const LIST_CAP = 500;

export async function listAssignedIssues(
	client: Transport,
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
