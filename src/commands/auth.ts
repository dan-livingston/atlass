import { input, password } from "@inquirer/prompts";

import { sessionFor } from "#/api/session.ts";
import { clearConfig, siteOrigin, readConfig, writeConfig } from "#/config.ts";
import { deleteToken, readToken, saveToken } from "#/credentials.ts";

interface Myself {
	displayName: string;
	emailAddress?: string;
}

export async function login(): Promise<void> {
	const site = siteOrigin(
		await input({
			message: "Atlassian site (e.g. acme.atlassian.net):",
			required: true,
		}),
	);
	const email = await input({ message: "Account email:", required: true });
	const token = await password({
		message: "API token (from id.atlassian.com/manage-profile/security/api-tokens):",
		mask: true,
	});

	const session = sessionFor({ site, email, token });
	const me = await session.getJson<Myself>("/rest/api/3/myself");

	const existing = (await readConfig()) ?? {};
	await writeConfig({ ...existing, site, email });
	saveToken(email, token);
	console.log(`Logged in as ${me.displayName} on ${site}.`);
}

export async function logout(): Promise<void> {
	const config = await readConfig();
	if (config?.email) deleteToken(config.email);
	const bitbucketLogin =
		config?.bitbucket && config.email
			? { email: config.email, bitbucket: config.bitbucket }
			: null;
	if (bitbucketLogin) await writeConfig(bitbucketLogin);
	else await clearConfig();
	console.log("Logged out. Credentials removed.");
}

export async function status(): Promise<void> {
	const config = await readConfig();
	if (!config || !config.site || !config.email) {
		console.log("Not logged in. Run `atlass auth login`.");
		return;
	}
	const hasToken = readToken(config.email) !== null;
	console.log(`Site:  ${config.site}`);
	console.log(`Email: ${config.email}`);
	console.log(`Token: ${hasToken ? "stored in keyring" : "MISSING (run `atlass auth login`)"}`);
}
