import { search, select } from "@inquirer/prompts";

import type { Transport } from "#/api/client.ts";
import type { CreateIssueType } from "#/api/jira-types.ts";
import type { ResolveUser } from "#/create/encode.ts";

import { listProjects } from "#/api/jira-projects.ts";
import { fetchMyself, searchAssignableUsers } from "#/api/jira-users.ts";

export async function resolveProject(
	client: Transport,
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

export async function resolveType(
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

export function userResolver(client: Transport, project: string): ResolveUser {
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
