import { httpError } from "#/api/http-error.ts";

const DISABLE_XSRF_CHECK = { "X-Atlassian-Token": "nocheck" };

export interface Credentials {
	site: string;
	email: string;
	token: string;
}

export interface Transport {
	getJson<T>(path: string): Promise<T>;
	postJson<T>(path: string, body: unknown): Promise<T>;
	putJson<T>(path: string, body: unknown): Promise<T>;
	putNoContent(path: string, body: unknown): Promise<void>;
	postMultipart<T>(path: string, filename: string, bytes: Uint8Array): Promise<T>;
	getBinary(urlOrPath: string): Promise<Uint8Array>;
}

export class AtlassianClient implements Transport {
	readonly site: string;
	private readonly authHeader: string;
	private readonly loginHint: string;

	constructor(credentials: Credentials, loginHint: string) {
		this.site = credentials.site;
		const basic = Buffer.from(`${credentials.email}:${credentials.token}`).toString("base64");
		this.authHeader = `Basic ${basic}`;
		this.loginHint = loginHint;
	}

	private async request(
		path: string,
		init: { method?: string; headers?: Record<string, string>; body?: string | FormData },
	): Promise<Response> {
		const res = await fetch(`${this.site}${path}`, {
			method: init.method,
			body: init.body,
			headers: { Authorization: this.authHeader, ...init.headers },
		});
		if (!res.ok) {
			const body = await res.text().catch(() => "");
			throw httpError(res.status, path, body, this.loginHint);
		}
		return res;
	}

	async getJson<T>(path: string): Promise<T> {
		const res = await this.request(path, { headers: { Accept: "application/json" } });
		return res.json() as Promise<T>;
	}

	async postJson<T>(path: string, body: unknown): Promise<T> {
		const res = await this.request(path, {
			method: "POST",
			headers: { Accept: "application/json", "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		return res.json() as Promise<T>;
	}

	async putJson<T>(path: string, body: unknown): Promise<T> {
		const res = await this.request(path, {
			method: "PUT",
			headers: { Accept: "application/json", "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		return res.json() as Promise<T>;
	}

	async putNoContent(path: string, body: unknown): Promise<void> {
		await this.request(path, {
			method: "PUT",
			headers: { Accept: "application/json", "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
	}

	async postMultipart<T>(path: string, filename: string, bytes: Uint8Array): Promise<T> {
		const form = new FormData();
		const blob = new Blob([bytes as unknown as Uint8Array<ArrayBuffer>]);
		form.append("file", blob, filename);
		const res = await this.request(path, {
			method: "POST",
			headers: { Accept: "application/json", ...DISABLE_XSRF_CHECK },
			body: form,
		});
		return res.json() as Promise<T>;
	}

	async getBinary(urlOrPath: string): Promise<Uint8Array> {
		const path = urlOrPath.startsWith("http") ? pathAndQuery(urlOrPath) : urlOrPath;
		const res = await this.request(path, { headers: { Accept: "*/*" } });
		return new Uint8Array(await res.arrayBuffer());
	}
}

export function pathAndQuery(absoluteUrl: string): string {
	const u = new URL(absoluteUrl);
	return u.pathname + u.search;
}
