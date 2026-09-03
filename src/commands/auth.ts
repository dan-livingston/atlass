import type { Env } from "#/env.ts";

import { sessionFor } from "#/api/session.ts";
import { siteOrigin } from "#/util/parse.ts";

interface Myself {
	displayName: string;
	emailAddress?: string;
}

export async function login({ term, profile }: Env): Promise<void> {
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

	const existing = (await profile.read()) ?? {};
	await profile.write({ ...existing, site, email });
	await profile.setToken(email, "atlassian", token);
	term.out(`Logged in as ${me.displayName} on ${site}.`);
}

export async function logout({ term, profile }: Env): Promise<void> {
	const config = await profile.read();
	if (config?.email) await profile.deleteToken(config.email, "atlassian");
	const bitbucketLogin =
		config?.bitbucket && config.email
			? { email: config.email, bitbucket: config.bitbucket }
			: null;
	if (bitbucketLogin) await profile.write(bitbucketLogin);
	else await profile.clear();
	term.out("Logged out. Credentials removed.");
}

export async function status({ term, profile }: Env): Promise<void> {
	const config = await profile.read();
	if (!config || !config.site || !config.email) {
		term.out("Not logged in. Run `atlass auth login`.");
		return;
	}
	const hasToken = (await profile.token(config.email, "atlassian")) !== null;
	term.out([
		`Site:  ${config.site}`,
		`Email: ${config.email}`,
		`Token: ${hasToken ? "stored in keyring" : "MISSING (run `atlass auth login`)"}`,
	]);
}
