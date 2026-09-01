import type { Auth } from "../credentials.ts";

const DISABLE_XSRF_CHECK = { "X-Atlassian-Token": "nocheck" };

export class AtlassianClient {
	private readonly site: string;
	private readonly authHeader: string;

	constructor(auth: Auth) {
		this.site = auth.site;
		const basic = Buffer.from(`${auth.email}:${auth.token}`).toString("base64");
		this.authHeader = `Basic ${basic}`;
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
			throw httpError(res.status, path, body);
		}
		return res;
	}

	async getJson<T>(path: string): Promise<T> {
		const res = await this.request(path, { headers: { Accept: "application/json" } });
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

export class HttpError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
		this.name = "HttpError";
	}
}

function httpError(status: number, path: string, body = ""): Error {
	if (status === 401 || status === 403) {
		return new HttpError(
			status,
			"Authentication failed (401/403). Run `atlass auth login` to update your token.",
		);
	}
	if (status === 404) {
		return new HttpError(status, `Not found (404): ${path}`);
	}
	if (status === 409) {
		const detail = extractErrorMessage(body);
		return new HttpError(
			status,
			`Conflict (409): ${detail || "the page changed on the server"}`,
		);
	}
	if (status === 413) {
		return new HttpError(
			status,
			"Payload too large (413): the page or an attachment exceeds the size limit.",
		);
	}
	if (status === 400) {
		const detail = extractErrorMessage(body);
		return new HttpError(status, `Bad request (400): ${detail || path}`);
	}
	const detail = extractErrorMessage(body);
	return new HttpError(status, `Request failed (${status}): ${detail || path}`);
}

interface JiraErrorBody {
	errorMessages?: string[];
	message?: string;
}

interface BitbucketErrorBody {
	error?: { message?: string };
}

export function extractErrorMessage(body: string): string {
	if (!body) return "";
	const json = tryParseJson<JiraErrorBody & BitbucketErrorBody>(body);
	if (json?.errorMessages?.length) return json.errorMessages.join("; ");
	if (json?.message) return json.message;
	if (json?.error?.message) return json.error.message;
	return body.slice(0, 300);
}

function tryParseJson<T>(text: string): T | null {
	try {
		return JSON.parse(text) as T;
	} catch {
		return null;
	}
}
