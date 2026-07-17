// Extract a Jira issue key (e.g. PROJ-123) from a bare key or any URL that
// contains one.
export function parseIssueKey(input: string): string | null {
	const match = input.toUpperCase().match(/[A-Z][A-Z0-9]+-\d+/);
	return match ? match[0] : null;
}

// Extract a Confluence page id from a bare numeric id or a page URL.
// Handles /wiki/spaces/SPACE/pages/123456/Title and ?pageId=123456 forms.
export function parsePageId(input: string): string | null {
	const trimmed = input.trim();
	if (/^\d+$/.test(trimmed)) return trimmed;
	const fromPath = trimmed.match(/\/pages\/(\d+)/);
	if (fromPath) return fromPath[1];
	const fromQuery = trimmed.match(/[?&]pageId=(\d+)/);
	if (fromQuery) return fromQuery[1];
	return null;
}

export interface RepoRef {
	workspace: string;
	repo: string;
}

// Resolve the target repo from the --repo flag and the stored Bitbucket config.
// Flag forms: "workspace/slug" (explicit workspace) or a bare "slug" (under the
// configured workspace). With no flag, fall back to the configured defaultRepo.
// Priority: flag > config default. Throws a friendly error when nothing resolves.
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

// Parse and clamp --limit; defaults to 25, capped at 100.
export function parseLimit(value: string | undefined): number {
	if (!value) return 25;
	const n = Number.parseInt(value, 10);
	if (!Number.isFinite(n) || n < 1) throw new Error(`Invalid --limit "${value}".`);
	return Math.min(n, 100);
}
