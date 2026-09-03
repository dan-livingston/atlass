import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface BitbucketConfig {
	workspace: string;
	defaultRepo?: string;
	uuid?: string;
}

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

export async function writeConfig(config: Config): Promise<void> {
	await mkdir(configDir(), { recursive: true });
	await writeFile(configPath(), `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export async function clearConfig(): Promise<void> {
	await rm(configPath(), { force: true });
}

export function siteOrigin(input: string): string {
	let value = input.trim();
	if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
	const url = new URL(value);
	return url.origin;
}
