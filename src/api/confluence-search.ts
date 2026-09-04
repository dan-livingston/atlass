import type { Transport } from "#/api/client.ts";

import { inClause, joinClauses, quote } from "#/api/query.ts";
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
	space?: string[];
	label?: string[];
	updatedSince?: string;
	starred?: boolean;
	limit: number;
}

interface SearchResponse {
	results?: {
		content?: { id?: string; title?: string; space?: { key?: string } };
		title?: string;
		url?: string;
		lastModified?: string;
		resultGlobalContainer?: { displayUrl?: string };
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
	return searchPagesByCql(client, site, buildCql(params), params.limit);
}

export async function searchPagesByCql(
	client: Transport,
	site: string,
	cql: string,
	limit: number,
): Promise<PageSearchResult> {
	const query = new URLSearchParams({
		cql,
		limit: String(limit),
		expand: "content.space",
	});
	const res = await client.getJson<SearchResponse>(`/wiki/rest/api/search?${query.toString()}`);
	const results = res.results ?? [];
	const serverPageWasFull = results.length === limit;
	const pages = results
		.filter((r) => r.content?.id)
		.map((r) => ({
			id: r.content?.id ?? "",
			space: r.content?.space?.key ?? spaceKeyOf(r.resultGlobalContainer?.displayUrl),
			title: decodeEntities(r.content?.title ?? r.title ?? ""),
			updated: r.lastModified ?? "",
			url: r.url ? `${site}/wiki${r.url}` : "",
		}));
	return { pages, hasMore: serverPageWasFull };
}

const SPACE_URL = /\/spaces\/([^/?#]+)/;

function spaceKeyOf(displayUrl: string | undefined): string {
	return SPACE_URL.exec(displayUrl ?? "")?.[1] ?? "";
}

export function buildCql(params: PageSearchParams): string {
	return joinClauses(
		[
			"type = page",
			params.starred ? "favourite = currentUser()" : null,
			inClause("space", params.space),
			inClause("label", params.label),
			params.updatedSince ? `lastmodified >= ${quote(params.updatedSince)}` : null,
			params.text ? `text ~ ${quote(params.text)}` : null,
		],
		"lastmodified DESC",
	);
}
