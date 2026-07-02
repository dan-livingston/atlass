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
		url: `${site}/browse/${issue.key}`,
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
		url: `${site}/browse/${i.key}`,
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
