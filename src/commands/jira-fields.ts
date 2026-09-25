import type { SiteField } from "#/api/jira-types.ts";
import type { SessionEnv } from "#/env.ts";

import { fetchCreateFields, fetchCreateIssueTypes } from "#/api/jira-createmeta.ts";
import { listSiteFields } from "#/api/jira-fields.ts";
import { resolveType } from "#/commands/jira-create-resolve.ts";
import { formatFieldRows, formatIssueTypeRows } from "#/create/format.ts";

export interface FieldsOptions {
	search?: string;
	json?: boolean;
}

export async function jiraFields(
	env: SessionEnv,
	projectArg: string | undefined,
	typeArg: string | undefined,
	options: FieldsOptions,
): Promise<void> {
	if (!projectArg) return siteFields(env, options);
	const project = projectArg.toUpperCase();
	if (options.search !== undefined) {
		throw new Error(
			`--search lists site fields and takes no project. Drop ${project}, or run \`atlass jira fields ${project}\` alone.`,
		);
	}
	return createForm(env, project, typeArg, options);
}

async function siteFields({ session, term }: SessionEnv, options: FieldsOptions): Promise<void> {
	const fields = matchingFields(await listSiteFields(session), options.search).sort((a, b) =>
		a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
	);
	if (options.json) term.json(fields);
	else if (fields.length === 0) term.out("No matching fields.");
	else term.out(formatSiteFieldRows(fields));
}

function matchingFields(fields: SiteField[], search: string | undefined): SiteField[] {
	const needle = search?.toLowerCase();
	return fields.filter(
		(f) =>
			!needle || f.name.toLowerCase().includes(needle) || f.id.toLowerCase().includes(needle),
	);
}

function formatSiteFieldRows(fields: SiteField[]): string[] {
	const width = (pick: (f: SiteField) => string) =>
		Math.max(...fields.map((f) => pick(f).length));
	const idWidth = width((f) => f.id);
	const nameWidth = width((f) => f.name);
	return fields.map((f) =>
		`${f.id.padEnd(idWidth)}  ${f.name.padEnd(nameWidth)}  ${shortFieldType(f)}`.trimEnd(),
	);
}

function shortFieldType(field: SiteField): string {
	const plugin = field.schema?.custom;
	if (plugin) return plugin.slice(plugin.lastIndexOf(":") + 1);
	return field.schema?.type ?? "";
}

async function createForm(
	{ session, term }: SessionEnv,
	project: string,
	typeArg: string | undefined,
	{ json }: FieldsOptions,
): Promise<void> {
	const types = await fetchCreateIssueTypes(session, project);
	if (!typeArg) {
		if (json) term.json(types);
		else if (types.length === 0) term.out(`You cannot create issues in ${project}.`);
		else term.out(formatIssueTypeRows(types));
		return;
	}
	const type = await resolveType(term.ask, project, types, typeArg, true);
	const fields = await fetchCreateFields(session, project, type.id);
	if (json) term.json(fields);
	else term.out(formatFieldRows(fields));
}
