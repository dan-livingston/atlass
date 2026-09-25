import type { IssueSummary } from "#/api/jira-types.ts";
import type { FieldColumn } from "#/commands/jira-field-columns.ts";
import type { Filters } from "#/commands/jira-filters.ts";
import type { OutputOptions, SearchRow } from "#/commands/search-run.ts";
import type { SessionEnv } from "#/env.ts";

import {
	listAssignedIssues,
	searchIssues,
	searchIssuesByJql,
	sortByCategoryThenUpdated,
} from "#/api/jira-search.ts";
import {
	fieldCell,
	fieldIds,
	resolveFieldColumns,
	withNamedFields,
} from "#/commands/jira-field-columns.ts";
import { checkQuery, searchHint, searchParams } from "#/commands/jira-filters.ts";
import { colorForCategory, copyIssue } from "#/commands/jira.ts";
import {
	alignedRows,
	checkedLimit,
	runSearch,
	searchFooter,
	showRows,
} from "#/commands/search-run.ts";

export interface FieldOptions extends OutputOptions {
	field?: string[];
}

export interface SearchOptions extends FieldOptions, Filters {}

export async function jiraSearch(
	env: SessionEnv,
	query: string | undefined,
	options: SearchOptions,
): Promise<void> {
	const { session } = env;
	checkQuery(query, options);

	const limit = checkedLimit(options);
	const columns = await resolveFieldColumns(session, options.field);
	const params = await searchParams(session, query, options, limit, Date.now());
	const issues = await searchIssues(session, session.site, params, fieldIds(columns)).catch(
		(err: unknown) => {
			throw searchHint(err, options.project);
		},
	);

	await showIssues(env, withNamedFields(issues, columns), columns, limit, options);
}

export async function jiraJql(
	env: SessionEnv,
	query: string,
	options: FieldOptions,
): Promise<void> {
	const { session } = env;
	const limit = checkedLimit(options);
	const columns = await resolveFieldColumns(session, options.field);
	const issues = await searchIssuesByJql(session, session.site, query, limit, fieldIds(columns));

	await showIssues(env, withNamedFields(issues, columns), columns, limit, options);
}

async function showIssues(
	env: SessionEnv,
	issues: IssueSummary[],
	columns: FieldColumn[],
	limit: number,
	options: OutputOptions,
	empty = "No matching issues.",
): Promise<void> {
	await showRows(
		env.term,
		formatIssueRows(issues, Date.now(), columns),
		{ empty, hasMore: issues.length === limit, limit },
		options,
		ISSUE_NOUN,
		(key) => copyIssue(env, key, options.out),
	);
}

export interface ListOptions extends FieldOptions {
	project?: string;
	all?: boolean;
}

export async function jiraList(env: SessionEnv, options: ListOptions): Promise<void> {
	const { session, term } = env;
	const limit = checkedLimit(options);
	const columns = await resolveFieldColumns(session, options.field);

	const { issues, truncated } = await listAssignedIssues(
		session,
		session.site,
		{ all: options.all, project: options.project },
		fieldIds(columns),
	);
	const sorted = sortByCategoryThenUpdated(withNamedFields(issues, columns));
	const shown = options.limit === undefined ? sorted : sorted.slice(0, limit);

	await runSearch(
		term,
		formatIssueRows(shown, Date.now(), columns),
		{
			json: options.json,
			copy: options.copy,
			out: options.out,
			empty: options.all ? "No issues assigned to you." : "No open issues assigned to you.",
			footer: listFooter(shown.length, sorted.length, truncated, limit),
		},
		ISSUE_NOUN,
		(key) => copyIssue(env, key, options.out),
	);
}

function listFooter(
	shown: number,
	fetched: number,
	truncated: boolean,
	limit: number,
): string | undefined {
	if (shown < fetched) return searchFooter(limit);
	if (truncated)
		return `
Showing the first ${shown}; narrow with --project.`;
	return undefined;
}

export function formatIssueRows(
	issues: IssueSummary[],
	nowMs: number,
	columns: FieldColumn[] = [],
): SearchRow[] {
	return alignedRows(issues, nowMs, (i) => ({
		id: i.key,
		url: i.url,
		label: i.status,
		color: colorForCategory(i.statusCategory),
		text: i.summary,
		timestamp: i.updated,
		columns: columns.map((c) => fieldCell(i.fields?.[c.name])),
	}));
}

const ISSUE_NOUN = { singular: "issue", plural: "issues" };
