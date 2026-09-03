import { confirm, search, select } from "@inquirer/prompts";
import { readFile } from "node:fs/promises";

import type { CreateField, CreateIssueType } from "#/api/jira.ts";
import type { FieldInput, ResolveUser } from "#/create/encode.ts";

import { AtlassianClient, HttpError } from "#/api/client.ts";
import {
	createIssue,
	fetchCreateFields,
	fetchCreateIssueTypes,
	fetchMyself,
	listProjects,
	searchAssignableUsers,
} from "#/api/jira.ts";
import { encodeCreate } from "#/create/encode.ts";
import { formatFieldRows, formatIssueTypeRows, formatMissingFields } from "#/create/format.ts";
import { walkFields } from "#/create/prompt.ts";
import { requireAuth } from "#/credentials.ts";

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
	projectArg: string | undefined,
	typeArg: string | undefined,
	options: CreateOptions,
): Promise<void> {
	const inputs = await flagInputs(options);
	const strict = inputs.length > 0 || options.input === false || !process.stdin.isTTY;

	const auth = await requireAuth();
	const client = new AtlassianClient(auth);
	const project = await resolveProject(client, auth.site, projectArg, strict);
	const types = await fetchCreateIssueTypes(client, project);
	const type = await resolveType(project, types, typeArg, strict);
	const meta = await fetchCreateFields(client, project, type.id);
	const resolveUser = userResolver(client, project);

	if (!strict) {
		inputs.push(
			...(await walkFields(meta, {
				searchUsers: (query) => searchAssignableUsers(client, project, query),
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
		console.log(JSON.stringify({ fields }, null, 2));
		return;
	}
	if (!strict) {
		for (const line of formatReview(meta, inputs)) console.log(line);
		const go = await confirm({ message: `Create ${project} ${type.name}?`, default: true });
		if (!go) {
			console.log("Aborted.");
			return;
		}
	}

	try {
		const created = await createIssue(client, auth.site, fields);
		if (options.json) console.log(JSON.stringify(created, null, 2));
		else console.log(`Created ${created.key}  ${created.url}`);
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

async function resolveProject(
	client: AtlassianClient,
	site: string,
	arg: string | undefined,
	strict: boolean,
): Promise<string> {
	if (arg) return arg.toUpperCase();
	if (strict)
		throw new Error("A project key is required, e.g. `jira create BSC Bug --summary ...`.");
	return search({
		message: "Project:",
		source: async (term) =>
			(await listProjects(client, site, term)).map((p) => ({
				name: `${p.key}  ${p.name}`,
				value: p.key,
			})),
		pageSize: 15,
	});
}

async function resolveType(
	project: string,
	types: CreateIssueType[],
	arg: string | undefined,
	strict: boolean,
): Promise<CreateIssueType> {
	if (types.length === 0) throw new Error(`You cannot create issues in ${project}.`);
	if (arg) {
		const found = matchType(types, arg);
		if (found) return found;
		const names = types.map((t) => t.name).join(", ");
		throw new Error(`${project} has no issue type "${arg}"; available: ${names}.`);
	}
	if (strict) {
		throw new Error(
			`An issue type is required; ${project} has: ${types.map((t) => t.name).join(", ")}.`,
		);
	}
	return select({
		message: "Issue type:",
		choices: types.map((t) => ({ name: t.name, value: t, description: t.description })),
		pageSize: 15,
	});
}

export function matchType(types: CreateIssueType[], arg: string): CreateIssueType | undefined {
	const needle = arg.trim().toLowerCase();
	return (
		types.find((t) => t.id === arg.trim()) ?? types.find((t) => t.name.toLowerCase() === needle)
	);
}

const ACCOUNT_ID = /^(?:[0-9a-f]{24}|[a-z0-9]+:[0-9a-f-]{36}(?::[0-9a-f-]{36})?)$/i;

function userResolver(client: AtlassianClient, project: string): ResolveUser {
	return async (query) => {
		if (query === "me") return (await fetchMyself(client)).accountId;
		if (ACCOUNT_ID.test(query)) return query;
		const users = (await searchAssignableUsers(client, project, query)).filter((u) => u.active);
		const exact = users.filter(
			(u) =>
				u.displayName.toLowerCase() === query.toLowerCase() ||
				u.email.toLowerCase() === query.toLowerCase(),
		);
		const candidates = exact.length === 1 ? exact : users;
		if (candidates.length === 1) return candidates[0]!.accountId;
		if (candidates.length === 0) throw new Error(`no assignable user matches "${query}".`);
		const names = candidates.map((u) => u.displayName).join(", ");
		throw new Error(`"${query}" matches ${candidates.length} users: ${names}.`);
	};
}

export interface FieldsOptions {
	json?: boolean;
}

export async function jiraFields(
	projectArg: string,
	typeArg: string | undefined,
	options: FieldsOptions,
): Promise<void> {
	const auth = await requireAuth();
	const client = new AtlassianClient(auth);
	const project = projectArg.toUpperCase();
	const types = await fetchCreateIssueTypes(client, project);
	if (!typeArg) {
		if (options.json) console.log(JSON.stringify(types, null, 2));
		else if (types.length === 0) console.log(`You cannot create issues in ${project}.`);
		else for (const line of formatIssueTypeRows(types)) console.log(line);
		return;
	}
	const type = await resolveType(project, types, typeArg, true);
	const fields = await fetchCreateFields(client, project, type.id);
	if (options.json) console.log(JSON.stringify(fields, null, 2));
	else for (const line of formatFieldRows(fields)) console.log(line);
}
