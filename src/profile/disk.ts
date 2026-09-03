import { Entry } from "@napi-rs/keyring";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { Config, Profile, TokenKind } from "#/profile.ts";

const SERVICE = "atlass";

function configDir(): string {
	const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
	return join(base, "atlass");
}

function configPath(): string {
	return join(configDir(), "config.json");
}

function entry(email: string, kind: TokenKind): Entry {
	return new Entry(SERVICE, kind === "bitbucket" ? `${email}:bitbucket` : email);
}

export function diskProfile(): Profile {
	return {
		async read(): Promise<Config | null> {
			try {
				const parsed = JSON.parse(await readFile(configPath(), "utf8")) as Config;
				return { site: parsed.site, email: parsed.email, bitbucket: parsed.bitbucket };
			} catch {
				return null;
			}
		},
		async write(config: Config): Promise<void> {
			await mkdir(configDir(), { recursive: true });
			await writeFile(configPath(), `${JSON.stringify(config, null, 2)}\n`, "utf8");
		},
		async clear(): Promise<void> {
			await rm(configPath(), { force: true });
		},
		async token(email: string, kind: TokenKind): Promise<string | null> {
			return entry(email, kind).getPassword();
		},
		async setToken(email: string, kind: TokenKind, token: string): Promise<void> {
			entry(email, kind).setPassword(token);
		},
		async deleteToken(email: string, kind: TokenKind): Promise<void> {
			try {
				entry(email, kind).deleteCredential();
			} catch {
				return;
			}
		},
	};
}
