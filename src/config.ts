import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// non-secret account info. the API token lives in the OS keyring, not here.
export interface Config {
	site: string;
	email: string;
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
		const parsed = JSON.parse(raw) as Partial<Config>;
		if (!parsed.site || !parsed.email) return null;
		return { site: parsed.site, email: parsed.email };
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

// normalize user input into a bare https origin, e.g. https://acme.atlassian.net
export function normalizeSite(input: string): string {
	let value = input.trim();
	if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
	const url = new URL(value);
	return url.origin;
}
