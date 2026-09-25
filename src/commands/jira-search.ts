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
import { alignedRows, checkedLimit, runSearch, showRows } from "#/commands/search-run.ts";

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
	checkedLimit(options);
	const columns = await resolveFieldColumns(session, options.field);

	const { issues, truncated } = await listAssignedIssues(
		session,
		session.site,
		{ all: options.all, project: options.project },
		fieldIds(columns),
	);

	await runSearch(
		term,
		formatIssueRows(
			sortByCategoryThenUpdated(withNamedFields(issues, columns)),
			Date.now(),
			columns,
		),
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
