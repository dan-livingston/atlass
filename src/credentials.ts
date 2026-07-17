import { Entry } from "@napi-rs/keyring";

import { readConfig } from "./config.ts";

const SERVICE = "atlass";

// Bitbucket Cloud has a single global API host, unlike the per-tenant
// *.atlassian.net origin Jira/Confluence use.
export const BITBUCKET_ORIGIN = "https://api.bitbucket.org";

// the Jira/Confluence token is keyed by the account email. the Bitbucket token
// is a distinct value (scoped for Bitbucket) under an ":bitbucket" sub-key so
// the two never collide.
function entry(key: string): Entry {
	return new Entry(SERVICE, key);
}

export function saveToken(email: string, token: string): void {
	entry(email).setPassword(token);
}

export function readToken(email: string): string | null {
	return entry(email).getPassword();
}

export function deleteToken(email: string): void {
	try {
		entry(email).deleteCredential();
	} catch {
		// no stored credential, nothing to remove
	}
}

function bitbucketKey(email: string): string {
	return `${email}:bitbucket`;
}

export function saveBitbucketToken(email: string, token: string): void {
	entry(bitbucketKey(email)).setPassword(token);
}

export function readBitbucketToken(email: string): string | null {
	return entry(bitbucketKey(email)).getPassword();
}

export function deleteBitbucketToken(email: string): void {
	try {
		entry(bitbucketKey(email)).deleteCredential();
	} catch {
		// no stored credential, nothing to remove
	}
}

// what AtlassianClient needs: an origin, plus the Basic auth pair.
export interface Auth {
	site: string;
	email: string;
	token: string;
}

// resolve full Jira/Confluence auth (config + keyring). throws a friendly error
// if missing.
export async function requireAuth(): Promise<Auth> {
	const config = await readConfig();
	if (!config || !config.site || !config.email) {
		throw new Error("Not logged in. Run `atlass auth login` first.");
	}
	const token = readToken(config.email);
	if (!token) {
		throw new Error("No API token found in keyring. Run `atlass auth login` again.");
	}
	return { site: config.site, email: config.email, token };
}

export interface BitbucketAuth extends Auth {
	workspace: string;
	defaultRepo?: string;
}

// resolve full Bitbucket auth. the origin is the fixed Bitbucket host; the Basic
// auth username is the shared account email; the token is the Bitbucket-scoped
// keyring entry.
export async function requireBitbucketAuth(): Promise<BitbucketAuth> {
	const config = await readConfig();
	if (!config || !config.email || !config.bitbucket?.workspace) {
		throw new Error("Not logged in to Bitbucket. Run `atlass bitbucket login` first.");
	}
	const token = readBitbucketToken(config.email);
	if (!token) {
		throw new Error(
			"No Bitbucket API token found in keyring. Run `atlass bitbucket login` again.",
		);
	}
	return {
		site: BITBUCKET_ORIGIN,
		email: config.email,
		token,
		workspace: config.bitbucket.workspace,
		defaultRepo: config.bitbucket.defaultRepo,
	};
}
