import type { Transport } from "#/api/client.ts";
import type { Env } from "#/env.ts";
import type { Profile } from "#/profile.ts";

import { fetchCurrentUserUuid } from "#/api/bitbucket-user.ts";
import { HttpError } from "#/api/http-error.ts";
import { bitbucketSessionFor } from "#/api/session.ts";

interface Workspace {
	slug?: string;
	name?: string;
}

export async function bitbucketLogin({ term, profile }: Env): Promise<void> {
	const existing = (await profile.read()) ?? {};
	const email =
		existing.email ?? (await term.ask.text({ message: "Account email:", required: true }));
	const workspace = (
		await term.ask.text({ message: "Bitbucket workspace (e.g. acme):", required: true })
	).trim();
	const defaultRepo =
		(await term.ask.text({ message: "Default repo slug (optional):" })).trim() || undefined;
	const token = await term.ask.secret({
		message:
			"Bitbucket API token (needs pipeline, pull request, account, and workspace read scopes):",
		mask: true,
	});

	const session = bitbucketSessionFor(email, token, { workspace });
	const ws = await verifyWorkspace(session, workspace);
	const uuid = await fetchCurrentUserUuid(session).catch(() => undefined);

	await profile.write({
		...existing,
		email,
		bitbucket: {
			workspace,
			...(defaultRepo ? { defaultRepo } : {}),
			...(uuid ? { uuid } : {}),
		},
	});
	await profile.setToken(email, "bitbucket", token);
	term.out(`Logged in to Bitbucket workspace ${ws.name ?? workspace} as ${email}.`);
}

export async function bitbucketLogout({ term, profile }: Env): Promise<void> {
	const config = await profile.read();
	if (config?.email) await profile.deleteToken(config.email, "bitbucket");
	const jiraLogin =
		config?.site && config.email ? { site: config.site, email: config.email } : null;
	if (jiraLogin) await profile.write(jiraLogin);
	else await profile.clear();
	term.out("Logged out of Bitbucket. Credentials removed.");
}

export async function bitbucketStatus({ term, profile }: Env): Promise<void> {
	const config = await profile.read();
	if (!config?.email || !config.bitbucket?.workspace) {
		term.out("Not logged in to Bitbucket. Run `atlass bitbucket login`.");
		return;
	}
	const hasToken = (await profile.token(config.email, "bitbucket")) !== null;
	term.out([
		`Workspace:    ${config.bitbucket.workspace}`,
		`Email:        ${config.email}`,
		`Default repo: ${config.bitbucket.defaultRepo ?? "(none)"}`,
		`Token:        ${hasToken ? "stored in keyring" : "MISSING (run `atlass bitbucket login`)"}`,
	]);
}

export async function rememberBitbucketUuid(profile: Profile, uuid: string): Promise<void> {
	const config = await profile.read();
	if (!config?.bitbucket) return;
	await profile.write({ ...config, bitbucket: { ...config.bitbucket, uuid } });
}

async function verifyWorkspace(transport: Transport, workspace: string): Promise<Workspace> {
	try {
		return await transport.getJson<Workspace>(
			`/2.0/workspaces/${encodeURIComponent(workspace)}`,
		);
	} catch (err) {
		if (err instanceof HttpError && (err.status === 401 || err.status === 403)) {
			throw new Error(
				`Could not verify Bitbucket workspace "${workspace}" (401/403). Check the token ` +
					`and that it has workspace read + read:pipeline:bitbucket scopes.`,
			);
		}
		if (err instanceof HttpError && err.status === 404) {
			throw new Error(`Bitbucket workspace "${workspace}" not found (404). Check the slug.`);
		}
		throw err;
	}
}
