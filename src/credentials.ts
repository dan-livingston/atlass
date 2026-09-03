import { Entry } from "@napi-rs/keyring";

import { readConfig } from "#/config.ts";

const SERVICE = "atlass";

export const BITBUCKET_ORIGIN = "https://api.bitbucket.org";

function entry(key: string): Entry {
	return new Entry(SERVICE, key);
}

function deleteEntryIfPresent(key: string): void {
	try {
		entry(key).deleteCredential();
	} catch {
		return;
	}
}

export function saveToken(email: string, token: string): void {
	entry(email).setPassword(token);
}

export function readToken(email: string): string | null {
	return entry(email).getPassword();
}

export function deleteToken(email: string): void {
	deleteEntryIfPresent(email);
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
	deleteEntryIfPresent(bitbucketKey(email));
}

export interface Auth {
	site: string;
	email: string;
	token: string;
}

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
	uuid?: string;
}

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
		uuid: config.bitbucket.uuid,
	};
}
