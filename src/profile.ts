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

export type TokenKind = "atlassian" | "bitbucket";

export interface Profile {
	read(): Promise<Config | null>;
	write(config: Config): Promise<void>;
	clear(): Promise<void>;
	token(email: string, kind: TokenKind): Promise<string | null>;
	setToken(email: string, kind: TokenKind, token: string): Promise<void>;
	deleteToken(email: string, kind: TokenKind): Promise<void>;
}
