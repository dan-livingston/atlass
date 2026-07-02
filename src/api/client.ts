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

	private async request(path: string, accept: string): Promise<Response> {
		const res = await fetch(`${this.site}${path}`, {
			headers: { Authorization: this.authHeader, Accept: accept },
		});
		if (!res.ok) {
			const body = await res.text().catch(() => "");
			throw httpError(res.status, path, body);
		}
		return res;
	}

	async getJson<T>(path: string): Promise<T> {
		const res = await this.request(path, "application/json");
		return res.json() as Promise<T>;
	}

	// download a binary attachment. accepts the relative or same-site absolute
	// URLs the Atlassian APIs hand back for media/content.
	async getBinary(url: string): Promise<Uint8Array> {
		const path = url.startsWith("http") ? new URL(url).pathname + new URL(url).search : url;
		const res = await this.request(path, "*/*");
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
