import type { Transport } from "#/api/client.ts";

import { decodeEntities } from "#/util/html.ts";

export interface PageSummary {
	id: string;
	space: string;
	title: string;
	updated: string;
	url: string;
}

export interface PageSearchParams {
	text?: string;
	space?: string;
	starred?: boolean;
	cql?: string;
	limit: number;
}

interface SearchResponse {
	results?: {
		content?: { id?: string; title?: string };
		title?: string;
		url?: string;
		lastModified?: string;
		space?: { key?: string };
		resultGlobalContainer?: { title?: string };
	}[];
}

export interface PageSearchResult {
	pages: PageSummary[];
	hasMore: boolean;
}

export async function searchPages(
	client: Transport,
	site: string,
	params: PageSearchParams,
): Promise<PageSearchResult> {
	const cql = buildCql(params);
	const query = new URLSearchParams({
		cql,
		limit: String(params.limit),
		expand: "space",
	});
	const res = await client.getJson<SearchResponse>(`/wiki/rest/api/search?${query.toString()}`);
	const results = res.results ?? [];
	const serverPageWasFull = results.length === params.limit;
	const pages = results
		.filter((r) => r.content?.id)
		.map((r) => ({
			id: r.content?.id ?? "",
			space: r.space?.key ?? r.resultGlobalContainer?.title ?? "",
			title: decodeEntities(r.content?.title ?? r.title ?? ""),
			updated: r.lastModified ?? "",
			url: r.url ? `${site}/wiki${r.url}` : "",
		}));
	return { pages, hasMore: serverPageWasFull };
}

export function buildCql(params: PageSearchParams): string {
	if (params.cql) return params.cql;
	const clauses = ["type = page"];
	if (params.starred) clauses.push("favourite = currentUser()");
	if (params.space) clauses.push(`space = ${cqlStringLiteral(params.space)}`);
	if (params.text) clauses.push(`text ~ ${cqlStringLiteral(params.text)}`);
	return `${clauses.join(" AND ")} ORDER BY lastmodified DESC`;
}

function cqlStringLiteral(value: string): string {
	return `"${value.replace(/(["\\])/g, "\\$1")}"`;
}
