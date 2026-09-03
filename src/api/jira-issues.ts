import type { AdfNode } from "#/adf/types.ts";
import type { AtlassianClient } from "#/api/client.ts";
import type { IssueUpdate, JiraComment, JiraIssue } from "#/api/jira-types.ts";

import { browseUrl } from "#/api/jira-url.ts";

interface IssueResponse {
	key: string;
	fields: {
		summary?: string;
		description?: AdfNode | null;
		issuetype?: { name?: string };
		status?: { name?: string; statusCategory?: { key?: string } };
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
		url: browseUrl(site, issue.key),
		summary: f.summary ?? "",
		type: f.issuetype?.name ?? "",
		status: f.status?.name ?? "",
		statusCategory: f.status?.statusCategory?.key ?? "",
		assignee: f.assignee?.displayName ?? "Unassigned",
		reporter: f.reporter?.displayName ?? "",
		priority: f.priority?.name ?? "",
		labels: f.labels ?? [],
		created: f.created ?? "",
		updated: f.updated ?? "",
		description: f.description ?? null,
		comments,
		attachments: (f.attachment ?? []).map((a) => ({
			mediaId: a.id,
			filename: a.filename,
			url: a.content,
		})),
	};
}

export async function updateIssue(
	client: AtlassianClient,
	key: string,
	update: IssueUpdate,
): Promise<void> {
	const fields: Record<string, unknown> = { description: update.description };
	if (update.summary !== undefined) fields["summary"] = update.summary;
	await client.putNoContent(`/rest/api/3/issue/${encodeURIComponent(key)}`, { fields });
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
