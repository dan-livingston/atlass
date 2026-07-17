import { input, password } from "@inquirer/prompts";

import { AtlassianClient } from "../api/client.ts";
import { clearConfig, normalizeSite, readConfig, writeConfig } from "../config.ts";
import { deleteToken, readToken, saveToken } from "../credentials.ts";

interface Myself {
	displayName: string;
	emailAddress?: string;
}

export async function login(): Promise<void> {
	const site = normalizeSite(
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

	// verify before persisting so we never save a broken credential.
	const client = new AtlassianClient({ site, email, token });
	const me = await client.getJson<Myself>("/rest/api/3/myself");

	// merge so a Bitbucket block (if any) survives a Jira login.
	const existing = (await readConfig()) ?? {};
	await writeConfig({ ...existing, site, email });
	saveToken(email, token);
	console.log(`Logged in as ${me.displayName} on ${site}.`);
}

export async function logout(): Promise<void> {
	const config = await readConfig();
	if (config?.email) deleteToken(config.email);
	// keep the Bitbucket login intact if present; only drop the Jira parts.
	if (config?.bitbucket && config.email) {
		await writeConfig({ email: config.email, bitbucket: config.bitbucket });
	} else {
		await clearConfig();
	}
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
