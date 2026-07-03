import type { AdfNode } from "../adf/types.ts";
import type { RemoteAttachment } from "./attachments.ts";
import type { AtlassianClient } from "./client.ts";

import { decodeEntities } from "../util/html.ts";

export interface ConfluenceComment {
	author: string;
	created: string;
	body: AdfNode | null;
}

export interface ConfluencePage {
	id: string;
	title: string;
	spaceKey: string;
	version: number;
	author: string;
	createdAt: string;
	updatedAt: string;
	url: string;
	body: AdfNode | null;
	// attachment id is the media fileId, so media nodes match by attrs.id
	attachments: RemoteAttachment[];
	comments: ConfluenceComment[];
}

interface PageResponse {
	id: string;
	title: string;
	spaceId: string;
	createdAt?: string;
	authorId?: string;
	version?: { number?: number; createdAt?: string; authorId?: string };
	body?: { atlas_doc_format?: { value?: string } };
	_links?: { webui?: string };
}

interface SpaceResponse {
	key?: string;
}

interface AttachmentsResponse {
	results: {
		fileId?: string;
		id: string;
		title?: string;
		downloadLink?: string;
		fileSize?: number;
	}[];
}

interface CommentsResponse {
	results: {
		version?: { authorId?: string; createdAt?: string };
		body?: { atlas_doc_format?: { value?: string } };
	}[];
}

interface UserResponse {
	displayName?: string;
}

export async function fetchPage(
	client: AtlassianClient,
	site: string,
	id: string,
): Promise<ConfluencePage> {
	const page = await client.getJson<PageResponse>(
		`/wiki/api/v2/pages/${encodeURIComponent(id)}?body-format=atlas_doc_format`,
	);
	const names = new UserNames(client);
	const [spaceKey, attachments, comments, author] = await Promise.all([
		fetchSpaceKey(client, page.spaceId),
		fetchAttachments(client, id),
		fetchComments(client, id, names),
		names.resolve(page.version?.authorId ?? page.authorId),
	]);

	const webui = page._links?.webui ?? "";
	return {
		id: page.id,
		title: page.title,
		spaceKey,
		version: page.version?.number ?? 0,
		author,
		createdAt: page.createdAt ?? "",
		updatedAt: page.version?.createdAt ?? "",
		url: webui ? `${site}/wiki${webui}` : "",
		body: parseAdf(page.body?.atlas_doc_format?.value),
		attachments,
		comments,
	};
}

// The current server state needed before an update: the version to bump and
// the live body, which the caller scans for content that Markdown cannot round
// trip.
export interface PageState {
	version: number;
	title: string;
	body: AdfNode | null;
}

export async function fetchPageState(client: AtlassianClient, id: string): Promise<PageState> {
	const page = await client.getJson<PageResponse>(
		`/wiki/api/v2/pages/${encodeURIComponent(id)}?body-format=atlas_doc_format`,
	);
	return {
		version: page.version?.number ?? 0,
		title: page.title,
		body: parseAdf(page.body?.atlas_doc_format?.value),
	};
}

export interface AttachmentInfo {
	filename: string;
	// media fileId, used both to match an image and as the ADF media node id
	fileId: string;
	// byte size, or -1 when the server did not report it
	size: number;
}

export async function listAttachments(
	client: AtlassianClient,
	id: string,
): Promise<AttachmentInfo[]> {
	const res = await client.getJson<AttachmentsResponse>(
		`/wiki/api/v2/pages/${encodeURIComponent(id)}/attachments?limit=250`,
	);
	return res.results.map((a) => ({
		filename: a.title ?? a.id,
		fileId: a.fileId ?? a.id,
		size: typeof a.fileSize === "number" ? a.fileSize : -1,
	}));
}

interface UploadResponse {
	results?: { title?: string; extensions?: { fileId?: string } }[];
}

// Upload (or version) an attachment and return its media fileId. Uses the v1
// endpoint, the only one that creates attachments; it upserts by filename.
export async function uploadAttachment(
	client: AtlassianClient,
	pageId: string,
	filename: string,
	bytes: Uint8Array,
): Promise<string> {
	const res = await client.postMultipart<UploadResponse>(
		`/wiki/rest/api/content/${encodeURIComponent(pageId)}/child/attachment`,
		filename,
		bytes,
	);
	const fileId = res.results?.[0]?.extensions?.fileId;
	if (fileId) return fileId;
	// some responses omit the fileId; recover it by re-listing attachments
	const listed = await listAttachments(client, pageId);
	const match = listed.find((a) => a.filename === filename);
	if (match) return match.fileId;
	throw new Error(`Upload of "${filename}" did not return a fileId.`);
}

export interface UpdatePageParams {
	title: string;
	version: number;
	body: AdfNode;
	message?: string;
}

// Replace a page body. version.number must be the current version plus one.
export async function updatePage(
	client: AtlassianClient,
	id: string,
	params: UpdatePageParams,
): Promise<number> {
	const res = await client.putJson<PageResponse>(`/wiki/api/v2/pages/${encodeURIComponent(id)}`, {
		id,
		status: "current",
		title: params.title,
		body: {
			representation: "atlas_doc_format",
			value: JSON.stringify(params.body),
		},
		version: { number: params.version, message: params.message },
	});
	return res.version?.number ?? params.version;
}

export interface PageSummary {
	id: string;
	space: string;
	title: string;
	url: string;
}

export interface PageSearchParams {
	text?: string;
	space?: string;
	cql?: string;
	limit: number;
}

interface SearchResponse {
	results?: {
		content?: { id?: string; title?: string };
		title?: string;
		url?: string;
		space?: { key?: string };
		resultGlobalContainer?: { title?: string };
	}[];
}

export interface PageSearchResult {
	pages: PageSummary[];
	// the API returned a full page, so more matches may exist
	hasMore: boolean;
}

export async function searchPages(
	client: AtlassianClient,
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
	// count against the raw results: some rows are dropped below for lacking a
	// content id, which must not hide that the server had a full page.
	const pages = results
		.filter((r) => r.content?.id)
		.map((r) => ({
			id: r.content?.id ?? "",
			space: r.space?.key ?? r.resultGlobalContainer?.title ?? "",
			title: decodeEntities(r.content?.title ?? r.title ?? ""),
			url: r.url ? `${site}/wiki${r.url}` : "",
		}));
	return { pages, hasMore: results.length === params.limit };
}

// Build CQL from friendly params, or return the raw --cql verbatim. Friendly
// mode always constrains to pages so every result is copy-able.
export function buildCql(params: PageSearchParams): string {
	if (params.cql) return params.cql;
	const clauses = ["type = page"];
	if (params.space) clauses.push(`space = ${cqlValue(params.space)}`);
	if (params.text) clauses.push(`text ~ ${cqlValue(params.text)}`);
	return `${clauses.join(" AND ")} ORDER BY lastmodified DESC`;
}

// Quote and escape a value for use in a CQL string literal.
function cqlValue(value: string): string {
	return `"${value.replace(/(["\\])/g, "\\$1")}"`;
}

async function fetchSpaceKey(client: AtlassianClient, spaceId: string): Promise<string> {
	if (!spaceId) return "";
	try {
		const space = await client.getJson<SpaceResponse>(
			`/wiki/api/v2/spaces/${encodeURIComponent(spaceId)}`,
		);
		return space.key ?? "";
	} catch {
		return "";
	}
}

async function fetchAttachments(client: AtlassianClient, id: string): Promise<RemoteAttachment[]> {
	const res = await client.getJson<AttachmentsResponse>(
		`/wiki/api/v2/pages/${encodeURIComponent(id)}/attachments?limit=250`,
	);
	return res.results
		.filter((a) => a.downloadLink)
		.map((a) => ({
			// match media nodes by fileId; fall back to attachment id
			id: a.fileId ?? a.id,
			filename: a.title ?? a.id,
			url: normalizeDownloadLink(a.downloadLink ?? ""),
		}));
}

async function fetchComments(
	client: AtlassianClient,
	id: string,
	names: UserNames,
): Promise<ConfluenceComment[]> {
	const res = await client.getJson<CommentsResponse>(
		`/wiki/api/v2/pages/${encodeURIComponent(id)}/footer-comments?body-format=atlas_doc_format&limit=250`,
	);
	return Promise.all(
		res.results.map(async (c) => ({
			author: await names.resolve(c.version?.authorId),
			created: c.version?.createdAt ?? "",
			body: parseAdf(c.body?.atlas_doc_format?.value),
		})),
	);
}

// Confluence download links are relative to the /wiki context path.
function normalizeDownloadLink(link: string): string {
	if (link.startsWith("http") || link.startsWith("/wiki")) return link;
	return `/wiki${link}`;
}

// The atlas_doc_format body is delivered as a JSON string.
function parseAdf(value: string | undefined): AdfNode | null {
	if (!value) return null;
	try {
		return JSON.parse(value) as AdfNode;
	} catch {
		return null;
	}
}

// Resolves account ids to display names, cached and failure-tolerant.
class UserNames {
	private readonly cache = new Map<string, string>();

	constructor(private readonly client: AtlassianClient) {}

	async resolve(accountId: string | undefined): Promise<string> {
		if (!accountId) return "";
		const cached = this.cache.get(accountId);
		if (cached !== undefined) return cached;
		let name = accountId;
		try {
			const user = await this.client.getJson<UserResponse>(
				`/wiki/rest/api/user?accountId=${encodeURIComponent(accountId)}`,
			);
			if (user.displayName) name = user.displayName;
		} catch {
			// fall back to the account id
		}
		this.cache.set(accountId, name);
		return name;
	}
}
