import type { AdfNode } from "#/adf/types.ts";
import type { RemoteAttachment } from "#/api/attachments.ts";
import type { AtlassianClient } from "#/api/client.ts";

import { HttpError } from "#/api/client.ts";
import { decodeEntities } from "#/util/html.ts";

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
	statusCategory: string;
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

const RECENT_ISSUES_CLAUSE = "updated >= -30d";

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

export interface IssueUpdate {
	description: AdfNode;
	summary?: string;
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

export interface IssueSummary {
	key: string;
	status: string;
	statusCategory: string;
	summary: string;
	updated: string;
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

export interface IssueListParams {
	all?: boolean;
	project?: string;
}

const OPEN_CLAUSE = "statusCategory != Done";

export function buildListJql(params: IssueListParams): string {
	const clauses = ["assignee = currentUser()"];
	if (params.project) clauses.push(`project = ${jqlStringLiteral(params.project)}`);
	clauses.push(params.all ? `(${OPEN_CLAUSE} OR ${RECENT_ISSUES_CLAUSE})` : OPEN_CLAUSE);
	return `${clauses.join(" AND ")} ORDER BY updated DESC`;
}

export interface IssueList {
	issues: IssueSummary[];
	truncated: boolean;
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

export function projectSearchQuery(query: string | undefined, startAt: number): string {
	const params = new URLSearchParams({
		orderBy: "key",
		maxResults: String(PROJECT_PAGE_SIZE),
		startAt: String(startAt),
	});
	if (query) params.set("query", query);
	return params.toString();
}

export interface StatusSummary {
	name: string;
	id: string;
	category: string;
	categoryKey: string;
}

interface StatusResponse {
	id: string;
	name: string;
	statusCategory?: { key?: string; name?: string };
}

interface IssueTypeStatusesResponse {
	statuses?: StatusResponse[];
}

export async function listStatuses(
	client: AtlassianClient,
	project?: string,
): Promise<StatusSummary[]> {
	const raw = project
		? await fetchProjectStatuses(client, project)
		: await client.getJson<StatusResponse[]>("/rest/api/3/status");
	return dedupeAndSortStatuses(raw.map(toStatusSummary));
}

async function fetchProjectStatuses(
	client: AtlassianClient,
	project: string,
): Promise<StatusResponse[]> {
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

function jqlStringLiteral(value: string): string {
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

export interface CreateIssueType {
	id: string;
	name: string;
	description: string;
	subtask: boolean;
}

export interface AllowedValue {
	id?: string;
	name?: string;
	value?: string;
	key?: string;
	children?: AllowedValue[];
}

export interface FieldSchema {
	type: string;
	items?: string;
	system?: string;
	custom?: string;
}

export interface CreateField {
	fieldId: string;
	name: string;
	required: boolean;
	hasDefaultValue: boolean;
	defaultValue?: unknown;
	schema: FieldSchema;
	allowedValues?: AllowedValue[];
}

interface CreateMetaPage {
	total?: number;
}

interface IssueTypesPage extends CreateMetaPage {
	issueTypes?: CreateIssueType[];
}

interface FieldsPage extends CreateMetaPage {
	fields?: CreateField[];
}

const CREATEMETA_PAGE_SIZE = 200;

export async function fetchCreateIssueTypes(
	client: AtlassianClient,
	project: string,
): Promise<CreateIssueType[]> {
	const types = await pageCreateMeta(
		client,
		project,
		"",
		(page: IssueTypesPage) => page.issueTypes ?? [],
	);
	return types.map((t) => ({
		id: t.id,
		name: t.name,
		description: t.description ?? "",
		subtask: t.subtask ?? false,
	}));
}

export async function fetchCreateFields(
	client: AtlassianClient,
	project: string,
	issueTypeId: string,
): Promise<CreateField[]> {
	return pageCreateMeta(
		client,
		project,
		`/${encodeURIComponent(issueTypeId)}`,
		(page: FieldsPage) => page.fields ?? [],
	);
}

async function pageCreateMeta<P extends CreateMetaPage, T>(
	client: AtlassianClient,
	project: string,
	suffix: string,
	items: (page: P) => T[],
): Promise<T[]> {
	const base = `/rest/api/3/issue/createmeta/${encodeURIComponent(project)}/issuetypes${suffix}`;
	const all: T[] = [];
	for (let startAt = 0; ; ) {
		let page: P;
		try {
			page = await client.getJson<P>(
				`${base}?startAt=${startAt}&maxResults=${CREATEMETA_PAGE_SIZE}`,
			);
		} catch (err) {
			if (err instanceof HttpError && err.status === 404) {
				throw new Error(`No project found with key "${project}".`);
			}
			throw err;
		}
		const values = items(page);
		all.push(...values);
		startAt += values.length;
		if (values.length === 0 || startAt >= (page.total ?? 0)) return all;
	}
}

export interface CreatedIssue {
	id: string;
	key: string;
	url: string;
}

export async function createIssue(
	client: AtlassianClient,
	site: string,
	fields: Record<string, unknown>,
): Promise<CreatedIssue> {
	const res = await client.postJson<{ id: string; key: string }>(
		"/rest/api/3/issue?updateHistory=true",
		{ fields },
	);
	return { id: res.id, key: res.key, url: browseUrl(site, res.key) };
}

export interface JiraUser {
	accountId: string;
	displayName: string;
	email: string;
	active: boolean;
}

interface UserResponse {
	accountId: string;
	displayName?: string;
	emailAddress?: string;
	active?: boolean;
}

export async function searchAssignableUsers(
	client: AtlassianClient,
	project: string,
	query: string,
): Promise<JiraUser[]> {
	const params = new URLSearchParams({ project, query, maxResults: "20" });
	const users = await client.getJson<UserResponse[]>(
		`/rest/api/3/user/assignable/search?${params.toString()}`,
	);
	return users.map(toJiraUser);
}

export async function fetchMyself(client: AtlassianClient): Promise<JiraUser> {
	return toJiraUser(await client.getJson<UserResponse>("/rest/api/3/myself"));
}

function toJiraUser(u: UserResponse): JiraUser {
	return {
		accountId: u.accountId,
		displayName: u.displayName ?? "",
		email: u.emailAddress ?? "",
		active: u.active ?? true,
	};
}
