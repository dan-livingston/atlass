import type { AtlassianClient } from "#/api/client.ts";

export async function fetchCurrentUserUuid(client: AtlassianClient): Promise<string> {
	const user = await client.getJson<{ uuid?: string }>("/2.0/user");
	if (!user.uuid) {
		throw new Error("Bitbucket did not return an account uuid for the current user.");
	}
	return user.uuid;
}
