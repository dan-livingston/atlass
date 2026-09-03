import type { AtlassianClient } from "#/api/client.ts";
import type { JiraUser } from "#/api/jira-types.ts";

interface UserResponse {
	accountId: string;
	displayName?: string;
	emailAddress?: string;
	active?: boolean;
}

export async function searchAssignableUsers(
	client: AtlassianClient,
	project: string,
	query: string,
): Promise<JiraUser[]> {
	const params = new URLSearchParams({ project, query, maxResults: "20" });
	const users = await client.getJson<UserResponse[]>(
		`/rest/api/3/user/assignable/search?${params.toString()}`,
	);
	return users.map(toJiraUser);
}

export async function fetchMyself(client: AtlassianClient): Promise<JiraUser> {
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
