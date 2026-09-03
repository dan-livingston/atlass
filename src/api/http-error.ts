export class HttpError extends Error {
	constructor(
		readonly status: number,
		message: string,
		readonly jira: JiraErrors = { errorMessages: [], errors: {} },
	) {
		super(message);
		this.name = "HttpError";
	}
}

export function httpError(
	status: number,
	path: string,
	body: string,
	loginHint: string,
): HttpError {
	if (status === 401 || status === 403) {
		return new HttpError(
			status,
			`Authentication failed (401/403). Run \`${loginHint}\` to update your token.`,
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
		return new HttpError(status, `Bad request (400): ${detail || path}`, jiraErrors(body));
	}
	const detail = extractErrorMessage(body);
	return new HttpError(status, `Request failed (${status}): ${detail || path}`, jiraErrors(body));
}

interface JiraErrorBody {
	errorMessages?: string[];
	errors?: Record<string, string>;
	message?: string;
}

interface BitbucketErrorBody {
	error?: { message?: string };
}

export function extractErrorMessage(body: string): string {
	if (!body) return "";
	const json = tryParseJson<JiraErrorBody & BitbucketErrorBody>(body);
	const { errorMessages, errors } = jiraErrors(body);
	const fromJira = [...errorMessages, ...Object.entries(errors).map(([f, m]) => `${f}: ${m}`)];
	if (fromJira.length) return fromJira.join("; ");
	if (json?.message) return json.message;
	if (json?.error?.message) return json.error.message;
	return body.slice(0, 300);
}

export interface JiraErrors {
	errorMessages: string[];
	errors: Record<string, string>;
}

export function jiraErrors(body: string): JiraErrors {
	const json = tryParseJson<JiraErrorBody>(body);
	return { errorMessages: json?.errorMessages ?? [], errors: json?.errors ?? {} };
}

function tryParseJson<T>(text: string): T | null {
	try {
		return JSON.parse(text) as T;
	} catch {
		return null;
	}
}
