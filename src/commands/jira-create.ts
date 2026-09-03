import { readFile } from "node:fs/promises";

import type { CreateField } from "#/api/jira-types.ts";
import type { FieldInput } from "#/create/encode.ts";
import type { Env } from "#/env.ts";

import { HttpError } from "#/api/http-error.ts";
import { createIssue, fetchCreateFields, fetchCreateIssueTypes } from "#/api/jira-createmeta.ts";
import { searchAssignableUsers } from "#/api/jira-users.ts";
import { resolveProject, resolveType, userResolver } from "#/commands/jira-create-resolve.ts";
import { encodeCreate } from "#/create/encode.ts";
import { formatFieldRows, formatIssueTypeRows, formatMissingFields } from "#/create/format.ts";
import { walkFields } from "#/create/prompt.ts";

export interface CreateOptions {
	summary?: string;
	description?: string;
	descriptionFile?: string;
	assignee?: string;
	priority?: string;
	label?: string[];
	component?: string[];
	parent?: string;
	field?: string[];
	input?: boolean;
	dryRun?: boolean;
	json?: boolean;
}

export async function flagInputs(options: CreateOptions): Promise<FieldInput[]> {
	const inputs: FieldInput[] = [];
	const one = (name: string, value: string | undefined, source: string) => {
		if (value !== undefined) inputs.push({ name, values: [value], source });
	};
	one("summary", options.summary, "--summary");
	one("description", options.description, "--description");
	if (options.descriptionFile !== undefined) {
		if (options.description !== undefined) {
			throw new Error("--description and --description-file cannot be used together.");
		}
		one("description", await readFile(options.descriptionFile, "utf8"), "--description-file");
	}
	one("assignee", options.assignee, "--assignee");
	one("priority", options.priority, "--priority");
	one("parent", options.parent, "--parent");
	if (options.label?.length)
		inputs.push({ name: "labels", values: options.label, source: "--label" });
	if (options.component?.length) {
		inputs.push({ name: "components", values: options.component, source: "--component" });
	}
	for (const raw of options.field ?? []) inputs.push(parseFieldFlag(raw));
	return inputs;
}

export function parseFieldFlag(raw: string): FieldInput {
	const eq = raw.indexOf("=");
	if (eq <= 0) throw new Error(`--field expects NAME=VALUE, got "${raw}".`);
	return { name: raw.slice(0, eq), values: [raw.slice(eq + 1)], source: "--field" };
}

export async function jiraCreate(
	{ session, term }: Env,
	projectArg: string | undefined,
	typeArg: string | undefined,
	options: CreateOptions,
): Promise<void> {
	const inputs = await flagInputs(options);
	const strict = inputs.length > 0 || options.input === false || !process.stdin.isTTY;

	const project = await resolveProject(term.ask, session, session.site, projectArg, strict);
	const types = await fetchCreateIssueTypes(session, project);
	const type = await resolveType(term.ask, project, types, typeArg, strict);
	const meta = await fetchCreateFields(session, project, type.id);
	const resolveUser = userResolver(session, project);

	if (!strict) {
		inputs.push(
			...(await walkFields(term.ask, meta, {
				searchUsers: (query) => searchAssignableUsers(session, project, query),
				validate: async (field, value) => {
					const probe = await encodeCreate(
						[field],
						[{ name: field.fieldId, values: [value], source: "prompt" }],
						resolveUser,
					);
					return probe.problems[0] ?? true;
				},
			})),
		);
	}

	const result = await encodeCreate(meta, inputs, resolveUser);
	if (result.problems.length > 0) throw new Error(result.problems.join("\n"));
	if (result.missing.length > 0) {
		throw new Error(formatMissingFields(project, type.name, result.missing).join("\n"));
	}
	const fields = {
		project: { key: project },
		issuetype: { id: type.id },
		...result.fields,
	};

	if (options.dryRun) {
		term.json({ fields });
		return;
	}
	if (!strict) {
		term.out(formatReview(meta, inputs));
		const go = await term.ask.confirm({
			message: `Create ${project} ${type.name}?`,
			default: true,
		});
		if (!go) {
			term.out("Aborted.");
			return;
		}
	}

	try {
		const created = await createIssue(session, session.site, fields);
		if (options.json) term.json(created);
		else term.out(`Created ${created.key}  ${created.url}`);
	} catch (err) {
		throw describeRejection(err, meta);
	}
}

function formatReview(meta: CreateField[], inputs: FieldInput[]): string[] {
	const width = Math.max(...inputs.map((i) => nameOf(meta, i.name).length));
	return inputs.map(
		(i) =>
			`${`${nameOf(meta, i.name)}:`.padEnd(width + 1)}  ${i.display ?? i.values.join(", ")}`,
	);
}

function nameOf(meta: CreateField[], idOrName: string): string {
	return meta.find((f) => f.fieldId === idOrName)?.name ?? idOrName;
}

function describeRejection(err: unknown, meta: CreateField[]): unknown {
	if (!(err instanceof HttpError)) return err;
	const { errorMessages, errors } = err.jira;
	const perField = Object.entries(errors).map(([id, msg]) => {
		const name = nameOf(meta, id);
		return name === id ? `  ${id}: ${msg}` : `  ${name} (${id}): ${msg}`;
	});
	if (errorMessages.length === 0 && perField.length === 0) return err;
	return new Error(
		["Jira rejected the issue:", ...errorMessages.map((m) => `  ${m}`), ...perField].join("\n"),
	);
}

export interface FieldsOptions {
	json?: boolean;
}

export async function jiraFields(
	{ session, term }: Env,
	projectArg: string,
	typeArg: string | undefined,
	options: FieldsOptions,
): Promise<void> {
	const project = projectArg.toUpperCase();
	const types = await fetchCreateIssueTypes(session, project);
	if (!typeArg) {
		if (options.json) term.json(types);
		else if (types.length === 0) term.out(`You cannot create issues in ${project}.`);
		else term.out(formatIssueTypeRows(types));
		return;
	}
	const type = await resolveType(term.ask, project, types, typeArg, true);
	const fields = await fetchCreateFields(session, project, type.id);
	if (options.json) term.json(fields);
	else term.out(formatFieldRows(fields));
}
