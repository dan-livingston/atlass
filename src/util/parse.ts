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
