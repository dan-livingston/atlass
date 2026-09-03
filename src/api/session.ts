import type { Credentials, Transport } from "#/api/client.ts";
import type { BitbucketConfig } from "#/config.ts";

import { AtlassianClient } from "#/api/client.ts";
import { readConfig } from "#/config.ts";
import { readBitbucketToken, readToken } from "#/credentials.ts";

const BITBUCKET_ORIGIN = "https://api.bitbucket.org";

const ATLASSIAN_LOGIN = "atlass auth login";
const BITBUCKET_LOGIN = "atlass bitbucket login";

export interface AtlassianSession extends Transport {
	readonly site: string;
}

export interface BitbucketSession extends Transport {
	readonly workspace: string;
	readonly defaultRepo?: string;
	readonly uuid?: string;
}

class BitbucketClient extends AtlassianClient implements BitbucketSession {
	readonly workspace: string;
	readonly defaultRepo?: string;
	readonly uuid?: string;

	constructor(email: string, token: string, bitbucket: BitbucketConfig) {
		super({ site: BITBUCKET_ORIGIN, email, token }, BITBUCKET_LOGIN);
		this.workspace = bitbucket.workspace;
		this.defaultRepo = bitbucket.defaultRepo;
		this.uuid = bitbucket.uuid;
	}
}

export function sessionFor(credentials: Credentials): AtlassianSession {
	return new AtlassianClient(credentials, ATLASSIAN_LOGIN);
}

export function bitbucketSessionFor(
	email: string,
	token: string,
	bitbucket: BitbucketConfig,
): BitbucketSession {
	return new BitbucketClient(email, token, bitbucket);
}

export async function openSession(): Promise<AtlassianSession> {
	const config = await readConfig();
	if (!config?.site || !config.email) {
		throw new Error("Not logged in. Run `atlass auth login` first.");
	}
	const token = readToken(config.email);
	if (!token) {
		throw new Error("No API token found in keyring. Run `atlass auth login` again.");
	}
	return sessionFor({ site: config.site, email: config.email, token });
}

export async function openBitbucketSession(): Promise<BitbucketSession> {
	const config = await readConfig();
	if (!config?.email || !config.bitbucket?.workspace) {
		throw new Error("Not logged in to Bitbucket. Run `atlass bitbucket login` first.");
	}
	const token = readBitbucketToken(config.email);
	if (!token) {
		throw new Error(
			"No Bitbucket API token found in keyring. Run `atlass bitbucket login` again.",
		);
	}
	return bitbucketSessionFor(config.email, token, config.bitbucket);
}
