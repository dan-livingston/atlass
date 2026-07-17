import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// Bitbucket lives beside the Jira/Confluence account. workspace + optional
// default repo; the Bitbucket API token lives in the keyring, not here.
export interface BitbucketConfig {
	workspace: string;
	defaultRepo?: string;
}

// non-secret account info. API tokens live in the OS keyring, not here. Every
// field is optional on disk: a Jira-only user has no bitbucket block, and a
// Bitbucket-only user has no site. Each requireX validates what it needs.
export interface Config {
	site?: string;
	email?: string;
	bitbucket?: BitbucketConfig;
}

function configDir(): string {
	const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
	return join(base, "atlass");
}

function configPath(): string {
	return join(configDir(), "config.json");
}

// Read the stored config. Returns null only when nothing is stored (file absent
// or unreadable); individual fields may still be missing on a partial config.
export async function readConfig(): Promise<Config | null> {
	try {
		const raw = await readFile(configPath(), "utf8");
		const parsed = JSON.parse(raw) as Config;
		return {
			site: parsed.site,
			email: parsed.email,
			bitbucket: parsed.bitbucket,
		};
	} catch {
		return null;
	}
}

// Persist the whole config object. Callers merge with the existing config so one
// provider's login never drops the other's block.
export async function writeConfig(config: Config): Promise<void> {
	await mkdir(configDir(), { recursive: true });
	await writeFile(configPath(), `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export async function clearConfig(): Promise<void> {
	await rm(configPath(), { force: true });
}

// normalize user input into a bare https origin, e.g. https://acme.atlassian.net
export function normalizeSite(input: string): string {
	let value = input.trim();
	if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
	const url = new URL(value);
	return url.origin;
}
