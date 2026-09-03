import { input } from "@inquirer/prompts";
import kleur from "kleur";
import { readFile } from "node:fs/promises";

import type { JiraIssue, ProjectSummary, StatusSummary } from "#/api/jira-types.ts";
import type { ViewOptions } from "#/commands/view.ts";

import { AtlassianClient } from "#/api/client.ts";
import { fetchIssue, updateIssue } from "#/api/jira-issues.ts";
import { listProjects } from "#/api/jira-projects.ts";
import { listStatuses } from "#/api/jira-statuses.ts";
import { resolveRef } from "#/commands/resolve-ref.ts";
import {
	attachmentSection,
	bodyLines,
	commentSection,
	dateWithAge,
	fieldLines,
} from "#/commands/view.ts";
import { planIssueCopy } from "#/copy/plan.ts";
import { runCopy } from "#/copy/run.ts";
import { requireAuth } from "#/credentials.ts";
import { parseIssueSource } from "#/markdown/copied-document.ts";
import { planIssueUpdate } from "#/update/plan.ts";
import { runPlan } from "#/update/run.ts";
import { printPaged } from "#/util/pager.ts";
import { parseIssueKey } from "#/util/parse.ts";

export interface CopyOptions {
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

export async function jiraView(arg: string | undefined, options: ViewOptions): Promise<void> {
	const auth = await requireAuth();
	const key = await resolveRef(arg, ISSUE_REF);
	const client = new AtlassianClient(auth);
	const issue = await fetchIssue(client, auth.site, key);
	const lines = formatIssueView(issue, Date.now(), options.allComments ?? false);
	await printPaged(lines.join("\n"), { pager: options.pager });
}

const CATEGORY_COLORS: Record<string, (text: string) => string> = {
	new: kleur.cyan,
	indeterminate: kleur.yellow,
	done: kleur.green,
};

export function colorForCategory(category: string): (text: string) => string {
	return CATEGORY_COLORS[category] ?? ((text: string) => text);
}

export function formatIssueView(issue: JiraIssue, nowMs: number, allComments: boolean): string[] {
	const colorStatus = colorForCategory(issue.statusCategory);
	return [
		`${kleur.bold(issue.key)}  ${issue.summary}`,
		...fieldLines([
			["Type", issue.type],
			["Status", issue.status && colorStatus(issue.status)],
			["Assignee", issue.assignee],
			["Reporter", issue.reporter],
			["Priority", issue.priority],
			["Labels", issue.labels.join(", ")],
			["Created", dateWithAge(issue.created, nowMs)],
			["Updated", dateWithAge(issue.updated, nowMs)],
			["URL", issue.url],
		]),
		...bodyLines(issue.description),
		...commentSection(issue.comments, allComments),
		...attachmentSection(issue.attachments),
	];
}

export async function jiraCopy(arg: string | undefined, options: CopyOptions): Promise<void> {
	const auth = await requireAuth();
	const key = await resolveRef(arg, ISSUE_REF);
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

export async function copyIssue(
	client: AtlassianClient,
	site: string,
	key: string,
	out: string | undefined,
): Promise<void> {
	console.log(`Fetching ${key} ...`);
	const issue = await fetchIssue(client, site, key);
	await runCopy(planIssueCopy(issue, out), (url) => client.getBinary(url));
}

const ISSUE_REF = {
	message: "Jira issue key or URL:",
	parse: parseIssueKey,
	notFound: (raw: string) => `Could not find an issue key in "${raw}" (expected e.g. PROJ-123).`,
};
