import type { IssueSummary } from "#/api/jira-types.ts";
import type { Filters } from "#/commands/jira-filters.ts";
import type { OutputOptions, SearchRow } from "#/commands/search-run.ts";
import type { SessionEnv } from "#/env.ts";

import {
	listAssignedIssues,
	searchIssues,
	searchIssuesByJql,
	sortByCategoryThenUpdated,
} from "#/api/jira-search.ts";
import { checkQuery, searchHint, searchParams } from "#/commands/jira-filters.ts";
import { colorForCategory, copyIssue } from "#/commands/jira.ts";
import { alignedRows, checkedLimit, runSearch, showRows } from "#/commands/search-run.ts";

export interface SearchOptions extends OutputOptions, Filters {}

export async function jiraSearch(
	env: SessionEnv,
	query: string | undefined,
	options: SearchOptions,
): Promise<void> {
	const { session } = env;
	checkQuery(query, options);

	const limit = checkedLimit(options);
	const params = await searchParams(session, query, options, limit, Date.now());
	const issues = await searchIssues(session, session.site, params).catch((err: unknown) => {
		throw searchHint(err, options.project);
	});

	await showIssues(env, issues, limit, options);
}

export async function jiraJql(
	env: SessionEnv,
	query: string,
	options: OutputOptions,
): Promise<void> {
	const { session } = env;
	const limit = checkedLimit(options);
	const issues = await searchIssuesByJql(session, session.site, query, limit);

	await showIssues(env, issues, limit, options);
}

async function showIssues(
	env: SessionEnv,
	issues: IssueSummary[],
	limit: number,
	options: OutputOptions,
	empty = "No matching issues.",
): Promise<void> {
	await showRows(
		env.term,
		formatIssueRows(issues, Date.now()),
		{ empty, hasMore: issues.length === limit, limit },
		options,
		ISSUE_NOUN,
		(key) => copyIssue(env, key, options.out),
	);
}

export interface ListOptions extends OutputOptions {
	project?: string;
	all?: boolean;
}

export async function jiraList(env: SessionEnv, options: ListOptions): Promise<void> {
	const { session, term } = env;
	checkedLimit(options);

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
		(key) => copyIssue(env, key, options.out),
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
