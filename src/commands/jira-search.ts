import type { IssueSummary } from "#/api/jira-types.ts";
import type { SearchRow } from "#/commands/search-run.ts";
import type { Env } from "#/env.ts";

import { listAssignedIssues, searchIssues, sortByCategoryThenUpdated } from "#/api/jira-search.ts";
import { colorForCategory, copyIssue } from "#/commands/jira.ts";
import { alignedRows, runSearch, searchFooter } from "#/commands/search-run.ts";
import { parseLimit } from "#/util/parse.ts";

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

export async function jiraSearch(
	{ session, term }: Env,
	query: string | undefined,
	options: SearchOptions,
): Promise<void> {
	if (options.jql && (query || options.project || options.assignee || options.status)) {
		throw new Error("--jql cannot be combined with a text query or other filters.");
	}
	if (options.json && options.copy) {
		throw new Error("--json and --copy cannot be used together.");
	}

	const limit = parseLimit(options.limit);
	const issues = await searchIssues(session, session.site, {
		text: query,
		project: options.project,
		assignee: options.assignee,
		status: options.status,
		jql: options.jql,
		limit,
	});

	await runSearch(
		term,
		formatIssueRows(issues, Date.now()),
		{
			json: options.json,
			copy: options.copy,
			out: options.out,
			empty: "No matching issues.",
			footer: issues.length === limit ? searchFooter(limit) : undefined,
		},
		ISSUE_NOUN,
		(key) => copyIssue(term, session, key, options.out),
	);
}

export interface ListOptions {
	project?: string;
	all?: boolean;
	json?: boolean;
	copy?: boolean;
	out?: string;
}

export async function jiraList({ session, term }: Env, options: ListOptions): Promise<void> {
	if (options.json && options.copy) {
		throw new Error("--json and --copy cannot be used together.");
	}

	const { issues, truncated } = await listAssignedIssues(session, session.site, {
		all: options.all,
		project: options.project,
	});

	await runSearch(
		term,
		formatIssueRows(sortByCategoryThenUpdated(issues), Date.now()),
		{
			json: options.json,
			copy: options.copy,
			out: options.out,
			empty: options.all ? "No issues assigned to you." : "No open issues assigned to you.",
			footer: truncated
				? `\nShowing the first ${issues.length}; narrow with --project.`
				: undefined,
		},
		ISSUE_NOUN,
		(key) => copyIssue(term, session, key, options.out),
	);
}

export function formatIssueRows(issues: IssueSummary[], nowMs: number): SearchRow[] {
	return alignedRows(issues, nowMs, (i) => ({
		id: i.key,
		url: i.url,
		label: i.status,
		color: colorForCategory(i.statusCategory),
		text: i.summary,
		timestamp: i.updated,
	}));
}

const ISSUE_NOUN = { singular: "issue", plural: "issues" };
