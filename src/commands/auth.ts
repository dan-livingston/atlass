import type { Terminal } from "#/terminal.ts";

import { sessionFor } from "#/api/session.ts";
import { clearConfig, siteOrigin, readConfig, writeConfig } from "#/config.ts";
import { deleteToken, readToken, saveToken } from "#/credentials.ts";

interface Myself {
	displayName: string;
	emailAddress?: string;
}

export async function login(term: Terminal): Promise<void> {
	const site = siteOrigin(
		await term.ask.text({
			message: "Atlassian site (e.g. acme.atlassian.net):",
			required: true,
		}),
	);
	const email = await term.ask.text({ message: "Account email:", required: true });
	const token = await term.ask.secret({
		message: "API token (from id.atlassian.com/manage-profile/security/api-tokens):",
		mask: true,
	});

	const session = sessionFor({ site, email, token });
	const me = await session.getJson<Myself>("/rest/api/3/myself");

	const existing = (await readConfig()) ?? {};
	await writeConfig({ ...existing, site, email });
	saveToken(email, token);
	term.out(`Logged in as ${me.displayName} on ${site}.`);
}

export async function logout(term: Terminal): Promise<void> {
	const config = await readConfig();
	if (config?.email) deleteToken(config.email);
	const bitbucketLogin =
		config?.bitbucket && config.email
			? { email: config.email, bitbucket: config.bitbucket }
			: null;
	if (bitbucketLogin) await writeConfig(bitbucketLogin);
	else await clearConfig();
	term.out("Logged out. Credentials removed.");
}

export async function status(term: Terminal): Promise<void> {
	const config = await readConfig();
	if (!config || !config.site || !config.email) {
		term.out("Not logged in. Run `atlass auth login`.");
		return;
	}
	const hasToken = readToken(config.email) !== null;
	term.out([
		`Site:  ${config.site}`,
		`Email: ${config.email}`,
		`Token: ${hasToken ? "stored in keyring" : "MISSING (run `atlass auth login`)"}`,
	]);
}
