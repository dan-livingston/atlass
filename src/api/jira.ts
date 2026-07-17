import type { AdfNode } from "../adf/types.ts";
import type { RemoteAttachment } from "./attachments.ts";
import type { AtlassianClient } from "./client.ts";

import { decodeEntities } from "../util/html.ts";

export interface JiraComment {
	author: string;
	created: string;
	body: AdfNode | null;
}

export interface JiraIssue {
	key: string;
	url: string;
	summary: string;
	type: string;
	status: string;
	assignee: string;
	reporter: string;
	priority: string;
	labels: string[];
	created: string;
	updated: string;
	description: AdfNode | null;
	comments: JiraComment[];
	attachments: RemoteAttachment[];
}

interface IssueResponse {
	key: string;
	fields: {
		summary?: string;
		description?: AdfNode | null;
		issuetype?: { name?: string };
		status?: { name?: string };
		assignee?: { displayName?: string } | null;
		reporter?: { displayName?: string } | null;
		priority?: { name?: string } | null;
		labels?: string[];
		created?: string;
		updated?: string;
		attachment?: { id: string; filename: string; content: string }[];
	};
}

interface CommentResponse {
	comments: {
		author?: { displayName?: string };
		created?: string;
		body?: AdfNode | null;
	}[];
}

const FIELDS = [
	"summary",
	"description",
	"issuetype",
	"status",
	"assignee",
	"reporter",
	"priority",
	"labels",
	"created",
	"updated",
	"attachment",
].join(",");

// Canonical short link for any Jira key (issue or project). Jira redirects
// /browse/<key> to the right place regardless of type.
function browseUrl(site: string, key: string): string {
	return `${site}/browse/${key}`;
}

export async function fetchIssue(
	client: AtlassianClient,
	site: string,
	key: string,
): Promise<JiraIssue> {
	const issue = await client.getJson<IssueResponse>(
		`/rest/api/3/issue/${encodeURIComponent(key)}?fields=${FIELDS}`,
	);
	const comments = await fetchComments(client, key);
	const f = issue.fields;
	return {
		key: issue.key,
		url: browseUrl(site, issue.key),
		summary: f.summary ?? "",
		type: f.issuetype?.name ?? "",
		status: f.status?.name ?? "",
		assignee: f.assignee?.displayName ?? "Unassigned",
		reporter: f.reporter?.displayName ?? "",
		priority: f.priority?.name ?? "",
		labels: f.labels ?? [],
		created: f.created ?? "",
		updated: f.updated ?? "",
		description: f.description ?? null,
		comments,
		attachments: (f.attachment ?? []).map((a) => ({
			id: a.id,
			filename: a.filename,
			url: a.content,
		})),
	};
}

export interface IssueUpdate {
	description: AdfNode;
	// pushed as the new issue summary only when set
	summary?: string;
}

// Update an issue's description (and optionally summary). The edit endpoint
// returns 204 No Content, so nothing is parsed back.
export async function updateIssue(
	client: AtlassianClient,
	key: string,
	update: IssueUpdate,
): Promise<void> {
	const fields: Record<string, unknown> = { description: update.description };
	if (update.summary !== undefined) fields["summary"] = update.summary;
	await client.put(`/rest/api/3/issue/${encodeURIComponent(key)}`, { fields });
}

export interface IssueSummary {
	key: string;
	status: string;
	summary: string;
	url: string;
}

export interface IssueSearchParams {
	text?: string;
	project?: string;
	assignee?: string;
	status?: string;
	jql?: string;
	limit: number;
}

interface SearchResponse {
	issues?: {
		key: string;
		fields?: { summary?: string; status?: { name?: string } };
	}[];
}

export async function searchIssues(
	client: AtlassianClient,
	site: string,
	params: IssueSearchParams,
): Promise<IssueSummary[]> {
	const jql = buildJql(params);
	const query = new URLSearchParams({
		jql,
		maxResults: String(params.limit),
		fields: "summary,status",
	});
	const res = await client.getJson<SearchResponse>(`/rest/api/3/search/jql?${query.toString()}`);
	return (res.issues ?? []).map((i) => ({
		key: i.key,
		status: i.fields?.status?.name ?? "",
		summary: decodeEntities(i.fields?.summary ?? ""),
		url: browseUrl(site, i.key),
	}));
}

// Build JQL from friendly params, or return the raw --jql verbatim. Friendly
// clauses are AND'd; ordering defaults to most recently updated.
export function buildJql(params: IssueSearchParams): string {
	if (params.jql) return params.jql;
	const clauses: string[] = [];
	if (params.project) clauses.push(`project = ${jqlValue(params.project)}`);
	if (params.assignee) {
		clauses.push(
			params.assignee === "me"
				? "assignee = currentUser()"
				: `assignee = ${jqlValue(params.assignee)}`,
		);
	}
	if (params.status) clauses.push(`status = ${jqlValue(params.status)}`);
	if (params.text) clauses.push(`text ~ ${jqlValue(params.text)}`);
	// the search endpoint rejects unbounded queries, so a bare search falls back
	// to recently updated issues.
	if (clauses.length === 0) clauses.push("updated >= -30d");
	return `${clauses.join(" AND ")} ORDER BY updated DESC`;
}

export interface ProjectSummary {
	key: string;
	name: string;
	id: string;
	type: string;
	url: string;
}

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

// Fetch every project the account can browse, following pagination until the
// last page. Ordered by key so the printed list is predictable.
export async function listProjects(
	client: AtlassianClient,
	site: string,
	query?: string,
): Promise<ProjectSummary[]> {
	const projects: ProjectSummary[] = [];
	for (let startAt = 0; ; ) {
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

// Build the project/search query string for one page. Exported for testing.
export function projectSearchQuery(query: string | undefined, startAt: number): string {
	const params = new URLSearchParams({
		orderBy: "key",
		maxResults: String(PROJECT_PAGE_SIZE),
		startAt: String(startAt),
	});
	if (query) params.set("query", query);
	return params.toString();
}

// Quote and escape a value for use in a JQL string literal.
function jqlValue(value: string): string {
	return `"${value.replace(/(["\\])/g, "\\$1")}"`;
}

async function fetchComments(client: AtlassianClient, key: string): Promise<JiraComment[]> {
	const res = await client.getJson<CommentResponse>(
		`/rest/api/3/issue/${encodeURIComponent(key)}/comment?maxResults=100&orderBy=created`,
	);
	return res.comments.map((c) => ({
		author: c.author?.displayName ?? "",
		created: c.created ?? "",
		body: c.body ?? null,
	}));
}
