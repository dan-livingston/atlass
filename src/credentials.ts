import { Entry } from "@napi-rs/keyring";

import type { Config } from "./config.ts";

import { readConfig } from "./config.ts";

const SERVICE = "atlass";

// the token is keyed by the account email so it stays tied to the config.
function entry(email: string): Entry {
	return new Entry(SERVICE, email);
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

export interface Auth extends Config {
	token: string;
}

// resolve full auth (config + keyring). throws a friendly error if missing.
export async function requireAuth(): Promise<Auth> {
	const config = await readConfig();
	if (!config) {
		throw new Error("Not logged in. Run `atlass auth login` first.");
	}
	const token = readToken(config.email);
	if (!token) {
		throw new Error("No API token found in keyring. Run `atlass auth login` again.");
	}
	return { ...config, token };
}
