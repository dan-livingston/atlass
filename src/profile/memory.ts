import type { Config, Profile, TokenKind } from "#/profile.ts";

export interface ProfileSeed {
	config?: Config;
	tokens?: Record<string, string>;
}

function key(email: string, kind: TokenKind): string {
	return `${email}:${kind}`;
}

export function memoryProfile(seed: ProfileSeed = {}): Profile {
	let config: Config | null = seed.config ?? null;
	const tokens = new Map(Object.entries(seed.tokens ?? {}));

	return {
		async read(): Promise<Config | null> {
			return config === null ? null : { ...config };
		},
		async write(next: Config): Promise<void> {
			config = { ...next };
		},
		async clear(): Promise<void> {
			config = null;
		},
		async token(email: string, kind: TokenKind): Promise<string | null> {
			return tokens.get(key(email, kind)) ?? null;
		},
		async setToken(email: string, kind: TokenKind, token: string): Promise<void> {
			tokens.set(key(email, kind), token);
		},
		async deleteToken(email: string, kind: TokenKind): Promise<void> {
			tokens.delete(key(email, kind));
		},
	};
}
