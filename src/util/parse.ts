export function parseIssueKey(input: string): string | null {
	const match = input.toUpperCase().match(/[A-Z][A-Z0-9]+-\d+/);
	return match ? match[0] : null;
}

export function parsePageId(input: string): string | null {
	const trimmed = input.trim();
	if (/^\d+$/.test(trimmed)) return trimmed;
	const fromPath = trimmed.match(/\/pages\/(\d+)/);
	if (fromPath) return fromPath[1];
	const fromQuery = trimmed.match(/[?&]pageId=(\d+)/);
	if (fromQuery) return fromQuery[1];
	return null;
}

export interface PullRequestRef {
	id: number;
	repo?: RepoRef;
}

const PULL_REQUEST_HOSTS = ["bitbucket.org", "www.bitbucket.org"];
const PULL_REQUEST_PATH = /^\/([^/]+)\/([^/]+)\/pull-requests\/(\d+)(?:\/|$)/;

export function parsePullRequestRef(input: string): PullRequestRef | null {
	const trimmed = input.trim();
	const bare = trimmed.replace(/^#/, "");
	if (/^\d+$/.test(bare)) return { id: Number.parseInt(bare, 10) };
	if (!/^https?:\/\//i.test(trimmed)) return null;
	const url = parseUrl(trimmed);
	if (!url || !PULL_REQUEST_HOSTS.includes(url.hostname.toLowerCase())) return null;
	const match = PULL_REQUEST_PATH.exec(url.pathname);
	if (!match) return null;
	const [, workspace = "", repo = "", id = ""] = match;
	return {
		id: Number.parseInt(id, 10),
		repo: { workspace: decodeURIComponent(workspace), repo: decodeURIComponent(repo) },
	};
}

function parseUrl(value: string): URL | null {
	try {
		return new URL(value);
	} catch {
		return null;
	}
}

export function isExternalHref(href: string): boolean {
	return /^[a-z][a-z0-9+.-]*:\/\//i.test(href);
}

export interface RepoRef {
	workspace: string;
	repo: string;
}

export function resolveRepo(
	flag: string | undefined,
	config: { workspace?: string; defaultRepo?: string },
): RepoRef {
	if (flag) {
		if (flag.includes("/")) {
			const parts = flag.split("/");
			const [workspace, repo] = parts;
			if (parts.length !== 2 || !workspace || !repo) {
				throw new Error(`Invalid --repo "${flag}". Expected "workspace/slug" or "slug".`);
			}
			return { workspace, repo };
		}
		if (!config.workspace) {
			throw new Error(
				`No Bitbucket workspace configured. Pass --repo workspace/slug or run \`atlass bitbucket login\`.`,
			);
		}
		return { workspace: config.workspace, repo: flag };
	}
	if (config.workspace && config.defaultRepo) {
		return { workspace: config.workspace, repo: config.defaultRepo };
	}
	throw new Error(
		`No repo given. Pass --repo workspace/slug (or a bare slug), or set a default repo at \`atlass bitbucket login\`.`,
	);
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export function parseLimit(value: string | undefined): number {
	if (!value) return DEFAULT_LIMIT;
	const n = Number.parseInt(value, 10);
	if (!Number.isFinite(n) || n < 1) throw new Error(`Invalid --limit "${value}".`);
	return Math.min(n, MAX_LIMIT);
}

export function siteOrigin(input: string): string {
	let value = input.trim();
	if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
	const url = new URL(value);
	return url.origin;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const RELATIVE = /^(\d+)([dwm])$/i;

export function parseSince(value: string, nowMs: number): string {
	const raw = value.trim();
	const iso = ISO_DATE.exec(raw);
	if (iso) {
		if (!isRealDate(iso)) throw invalidSince(value);
		return raw;
	}
	const relative = RELATIVE.exec(raw);
	if (!relative) throw invalidSince(value);
	const amount = Number.parseInt(relative[1]!, 10);
	const date = new Date(nowMs);
	switch (relative[2]!.toLowerCase()) {
		case "d":
			date.setDate(date.getDate() - amount);
			break;
		case "w":
			date.setDate(date.getDate() - amount * 7);
			break;
		default:
			date.setMonth(date.getMonth() - amount);
	}
	return localDate(date);
}

function isRealDate([, year = "", month = "", day = ""]: RegExpExecArray): boolean {
	const date = new Date(Number(year), Number(month) - 1, Number(day));
	return (
		date.getFullYear() === Number(year) &&
		date.getMonth() === Number(month) - 1 &&
		date.getDate() === Number(day)
	);
}

function localDate(date: Date): string {
	const month = String(date.getMonth() + 1).padStart(2, "0");
	return `${date.getFullYear()}-${month}-${String(date.getDate()).padStart(2, "0")}`;
}

function invalidSince(value: string): Error {
	return new Error(`Invalid --updated "${value}". Expected 7d, 2w, 3m, or YYYY-MM-DD.`);
}
