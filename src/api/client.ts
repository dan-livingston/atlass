import type { Auth } from "../credentials.ts";

// thin wrapper over fetch that adds Basic auth and turns HTTP errors into
// readable messages. one instance per resolved account.
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

	// upload a file as multipart/form-data. the field name must be "file" and the
	// XSRF check must be disabled for the Confluence attachment endpoint.
	async postMultipart<T>(path: string, filename: string, bytes: Uint8Array): Promise<T> {
		const form = new FormData();
		const blob = new Blob([bytes as unknown as Uint8Array<ArrayBuffer>]);
		form.append("file", blob, filename);
		const res = await this.request(path, {
			method: "POST",
			headers: { Accept: "application/json", "X-Atlassian-Token": "nocheck" },
			body: form,
		});
		return res.json() as Promise<T>;
	}

	// download a binary attachment. accepts the relative or same-site absolute
	// URLs the Atlassian APIs hand back for media/content.
	async getBinary(url: string): Promise<Uint8Array> {
		const path = url.startsWith("http") ? new URL(url).pathname + new URL(url).search : url;
		const res = await this.request(path, { headers: { Accept: "*/*" } });
		return new Uint8Array(await res.arrayBuffer());
	}
}

function httpError(status: number, path: string, body = ""): Error {
	if (status === 401 || status === 403) {
		return new Error(
			"Authentication failed (401/403). Run `atlass auth login` to update your token.",
		);
	}
	if (status === 404) {
		return new Error(`Not found (404): ${path}`);
	}
	if (status === 409) {
		const detail = extractError(body);
		return new Error(`Conflict (409): ${detail || "the page changed on the server"}`);
	}
	if (status === 413) {
		return new Error(
			"Payload too large (413): the page or an attachment exceeds the size limit.",
		);
	}
	if (status === 400) {
		const detail = extractError(body);
		return new Error(`Bad request (400): ${detail || path}`);
	}
	const detail = extractError(body);
	return new Error(`Request failed (${status}): ${detail || path}`);
}

// Jira and Confluence report query errors as JSON; pull out the readable
// message, falling back to the raw body.
function extractError(body: string): string {
	if (!body) return "";
	try {
		const json = JSON.parse(body) as {
			errorMessages?: string[];
			message?: string;
		};
		if (json.errorMessages?.length) return json.errorMessages.join("; ");
		if (json.message) return json.message;
	} catch {
		// not JSON, use the raw body
	}
	return body.slice(0, 300);
}
