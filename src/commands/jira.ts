import { input } from "@inquirer/prompts";
import kleur from "kleur";
import { readFile, writeFile } from "node:fs/promises";

import type { RemoteAttachment } from "../api/attachments.ts";
import type { JiraComment, JiraIssue, ProjectSummary, StatusSummary } from "../api/jira.ts";

import { adfToMarkdown } from "../adf/to-markdown.ts";
import { downloadAttachments, mediaResolver } from "../api/attachments.ts";
import { AtlassianClient } from "../api/client.ts";
import { fetchIssue, listProjects, listStatuses, searchIssues, updateIssue } from "../api/jira.ts";
import { requireAuth } from "../credentials.ts";
import { parseIssueSource, render } from "../markdown/copied-document.ts";
import { planIssueUpdate } from "../update/plan.ts";
import { runPlan } from "../update/run.ts";
import { formatDateTime, relativeTime } from "../util/format.ts";
import { resolveOutput } from "../util/output-path.ts";
import { parseIssueKey, parseLimit } from "../util/parse.ts";
import { runSearch } from "./search-run.ts";

export interface CopyOptions {
	out?: string;
}

export interface SearchOptions {
	project?: string;
	assignee?: string;
	status?: string;
	jql?: string;
	limit?: string;
	json?: boolean;
	copy?: boolean;
	out?: string;
}

export interface ProjectsOptions {
	json?: boolean;
}

export async function jiraProjects(
	query: string | undefined,
	options: ProjectsOptions,
): Promise<void> {
	const auth = await requireAuth();
	const client = new AtlassianClient(auth);
	const projects = await listProjects(client, auth.site, query);

	if (options.json) {
		console.log(JSON.stringify(projects, null, 2));
		return;
	}
	if (projects.length === 0) {
		console.log("No matching projects.");
		return;
	}
	for (const line of formatProjectRows(projects)) console.log(line);
}

export function formatProjectRows(projects: Pick<ProjectSummary, "key" | "name">[]): string[] {
	const width = Math.max(...projects.map((p) => p.key.length));
	return projects.map((p) => `${p.key.padEnd(width)}  ${p.name}`);
}

export interface StatusesOptions {
	project?: string;
	json?: boolean;
}

export async function jiraStatuses(
	query: string | undefined,
	options: StatusesOptions,
): Promise<void> {
	const auth = await requireAuth();
	const client = new AtlassianClient(auth);
	let statuses = await listStatuses(client, options.project);

	if (query) {
		const needle = query.toLowerCase();
		statuses = statuses.filter((s) => s.name.toLowerCase().includes(needle));
	}

	if (options.json) {
		console.log(JSON.stringify(statuses, null, 2));
		return;
	}
	if (statuses.length === 0) {
		console.log("No matching statuses.");
		return;
	}
	for (const line of formatStatusRows(statuses)) console.log(line);
}

export function formatStatusRows(statuses: Pick<StatusSummary, "name" | "category">[]): string[] {
	const width = Math.max(...statuses.map((s) => s.name.length));
	return statuses.map((s) => `${s.name.padEnd(width)}  ${s.category}`);
}

export interface ViewOptions {
	allComments?: boolean;
}

export async function jiraView(arg: string | undefined, options: ViewOptions): Promise<void> {
	const auth = await requireAuth();
	const key = await resolveKey(arg);
	const client = new AtlassianClient(auth);
	const issue = await fetchIssue(client, auth.site, key);
	for (const line of formatIssueView(issue, Date.now(), options.allComments ?? false)) {
		console.log(line);
	}
}

const VISIBLE_COMMENTS = 5;

const CATEGORY_COLORS: Record<string, (text: string) => string> = {
	new: kleur.cyan,
	indeterminate: kleur.yellow,
	done: kleur.green,
};

export function formatIssueView(issue: JiraIssue, nowMs: number, allComments: boolean): string[] {
	return [
		`${kleur.bold(issue.key)}  ${issue.summary}`,
		...fieldLines(issue, nowMs),
		...bodyLines(adfToMarkdown(issue.description)),
		...commentSection(issue.comments, allComments),
		...attachmentSection(issue.attachments),
	];
}

function fieldLines(issue: JiraIssue, nowMs: number): string[] {
	const colorStatus = CATEGORY_COLORS[issue.statusCategory] ?? ((text: string) => text);
	const pairs: [string, string][] = [
		["Type", issue.type],
		["Status", issue.status && colorStatus(issue.status)],
		["Assignee", issue.assignee],
		["Reporter", issue.reporter],
		["Priority", issue.priority],
		["Labels", issue.labels.join(", ")],
		["Created", dateWithAge(issue.created, nowMs)],
		["Updated", dateWithAge(issue.updated, nowMs)],
		["URL", issue.url],
	];
	const kept = pairs.filter(([, value]) => value !== "");
	const width = Math.max(...kept.map(([label]) => label.length)) + 1;
	return kept.map(([label, value]) => `${kleur.dim(`${label}:`.padEnd(width))}  ${value}`);
}

function dateWithAge(iso: string, nowMs: number): string {
	if (!iso) return "";
	return `${formatDateTime(iso).slice(0, 10)} (${relativeTime(iso, nowMs)})`;
}

function bodyLines(body: string): string[] {
	return body ? ["", body] : [];
}

function commentSection(comments: JiraComment[], allComments: boolean): string[] {
	if (comments.length === 0) return [];
	const visible = allComments ? comments : comments.slice(-VISIBLE_COMMENTS);
	const hidden = comments.length - visible.length;
	const heading =
		hidden > 0
			? `Comments (${comments.length}, showing last ${visible.length} — --all-comments for all)`
			: `Comments (${comments.length})`;
	const lines = ["", kleur.bold(heading)];
	for (const comment of visible) {
		const body = adfToMarkdown(comment.body);
		lines.push("", commentHeader(comment), ...(body ? [body] : []));
	}
	return lines;
}

function commentHeader(comment: JiraComment): string {
	const author = kleur.bold(comment.author || "Unknown");
	const when = comment.created ? ` · ${kleur.dim(formatDateTime(comment.created))}` : "";
	return `─ ${author}${when}`;
}

function attachmentSection(attachments: RemoteAttachment[]): string[] {
	if (attachments.length === 0) return [];
	return ["", kleur.bold("Attachments"), ...attachments.map((a) => `- ${a.filename}`)];
}

export async function jiraCopy(arg: string | undefined, options: CopyOptions): Promise<void> {
	const auth = await requireAuth();
	const key = await resolveKey(arg);
	const client = new AtlassianClient(auth);
	await copyIssue(client, auth.site, key, options.out);
}

export interface UpdateOptions {
	summary?: boolean;
	force?: boolean;
	dryRun?: boolean;
}

export async function jiraUpdate(arg: string | undefined, options: UpdateOptions): Promise<void> {
	const file =
		arg ?? (await input({ message: "Path to the issue Markdown file:", required: true }));
	const src = parseIssueSource(await readFile(file, "utf8"));

	const auth = await requireAuth();
	const client = new AtlassianClient(auth);
	const issue = await fetchIssue(client, auth.site, src.key);

	const plan = planIssueUpdate(src, issue, options);
	await runPlan(plan, options, async () => {
		const { current, next } = plan.headline;
		await updateIssue(client, src.key, {
			description: plan.body,
			summary: next !== current ? next : undefined,
		});
		console.log(`Updated ${src.key}.`);
	});
}

export async function jiraSearch(query: string | undefined, options: SearchOptions): Promise<void> {
	if (options.jql && (query || options.project || options.assignee || options.status)) {
		throw new Error("--jql cannot be combined with a text query or other filters.");
	}
	if (options.json && options.copy) {
		throw new Error("--json and --copy cannot be used together.");
	}

	const auth = await requireAuth();
	const client = new AtlassianClient(auth);
	const limit = parseLimit(options.limit);
	const issues = await searchIssues(client, auth.site, {
		text: query,
		project: options.project,
		assignee: options.assignee,
		status: options.status,
		jql: options.jql,
		limit,
	});

	await runSearch(
		issues.map((i) => ({
			id: i.key,
			fixedColumns: `${i.key}  ${i.status}`,
			freeText: i.summary,
			json: { key: i.key, status: i.status, summary: i.summary, url: i.url },
		})),
		{
			json: options.json,
			copy: options.copy,
			limit,
			hasMore: issues.length === limit,
			out: options.out,
		},
		{ singular: "issue", plural: "issues" },
		(key) => copyIssue(client, auth.site, key, options.out),
	);
}

async function copyIssue(
	client: AtlassianClient,
	site: string,
	key: string,
	out: string | undefined,
): Promise<void> {
	console.log(`Fetching ${key} ...`);
	const issue = await fetchIssue(client, site, key);

	const target = resolveOutput(issue.key, out);
	const downloaded = await downloadAttachments(
		client,
		issue.attachments,
		target.assetsDir,
		target.assetsDirName,
	);
	const resolveMedia = mediaResolver(downloaded);

	const document = render({
		fields: {
			key: issue.key,
			type: issue.type,
			status: issue.status,
			assignee: issue.assignee,
			reporter: issue.reporter,
			priority: issue.priority,
			labels: issue.labels,
			created: issue.created,
			updated: issue.updated,
			url: issue.url,
		},
		title: issue.summary,
		body: adfToMarkdown(issue.description, { resolveMedia }),
		comments: issue.comments.map((c) => ({
			author: c.author,
			created: c.created,
			body: adfToMarkdown(c.body, { resolveMedia }),
		})),
		attachments: downloaded,
	});

	await writeFile(target.filePath, document, "utf8");
	report(target.filePath, downloaded.length);
}

async function resolveKey(arg: string | undefined): Promise<string> {
	const raw = arg ?? (await input({ message: "Jira issue key or URL:", required: true }));
	const key = parseIssueKey(raw);
	if (!key) throw new Error(`Could not find an issue key in "${raw}" (expected e.g. PROJ-123).`);
	return key;
}

function report(filePath: string, assetCount: number): void {
	const suffix =
		assetCount > 0 ? ` (+${assetCount} attachment${assetCount === 1 ? "" : "s"})` : "";
	console.log(`Wrote ${filePath}${suffix}`);
}
