import type { Transport } from "#/api/client.ts";
import type { JiraUser } from "#/api/jira-types.ts";

interface UserResponse {
	accountId: string;
	displayName?: string;
	emailAddress?: string;
	active?: boolean;
}

export async function searchAssignableUsers(
	client: Transport,
	project: string,
	query: string,
): Promise<JiraUser[]> {
	const params = new URLSearchParams({ project, query, maxResults: "20" });
	const users = await client.getJson<UserResponse[]>(
		`/rest/api/3/user/assignable/search?${params.toString()}`,
	);
	return users.map(toJiraUser);
}

export const ACCOUNT_ID = /^(?:[0-9a-z]{24}|[a-z0-9]+:[0-9a-f-]{36}(?::[0-9a-f-]{36})?)$/i;

export async function searchUsers(client: Transport, query: string): Promise<JiraUser[]> {
	const params = new URLSearchParams({ query, maxResults: "20" });
	const users = await client.getJson<UserResponse[]>(
		`/rest/api/3/user/search?${params.toString()}`,
	);
	return users.map(toJiraUser);
}

export function matchUser(users: JiraUser[], query: string, noun: string): string {
	const active = users.filter((u) => u.active);
	const needle = query.toLowerCase();
	const exact = active.filter(
		(u) => u.displayName.toLowerCase() === needle || u.email.toLowerCase() === needle,
	);
	const candidates = exact.length === 1 ? exact : active;
	if (candidates.length === 1) return candidates[0]!.accountId;
	if (candidates.length === 0) throw new Error(`no ${noun} matches "${query}".`);
	const names = candidates.map((u) => u.displayName).join(", ");
	throw new Error(`"${query}" matches ${candidates.length} users: ${names}.`);
}

export async function fetchMyself(client: Transport): Promise<JiraUser> {
	return toJiraUser(await client.getJson<UserResponse>("/rest/api/3/myself"));
}

function toJiraUser(u: UserResponse): JiraUser {
	return {
		accountId: u.accountId,
		displayName: u.displayName ?? "",
		email: u.emailAddress ?? "",
		active: u.active ?? true,
	};
}
