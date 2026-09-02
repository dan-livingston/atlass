import type { AdfNode } from "#/adf/types.ts";
import type { RemoteAttachment } from "#/api/attachments.ts";
import type { AtlassianClient } from "#/api/client.ts";

import { decodeEntities } from "#/util/html.ts";

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

interface AttachmentResponse {
	fileId?: string;
	id: string;
	title?: string;
	downloadLink?: string;
	fileSize?: number;
}

interface AttachmentsResponse {
	results: AttachmentResponse[];
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
		body: parseAdfJson(page.body?.atlas_doc_format?.value),
		attachments,
		comments,
	};
}

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
		body: parseAdfJson(page.body?.atlas_doc_format?.value),
	};
}

export interface AttachmentInfo {
	filename: string;
	fileId: string;
	size: number;
}

const UNKNOWN_SIZE = -1;

export async function listAttachments(
	client: AtlassianClient,
	id: string,
): Promise<AttachmentInfo[]> {
	const res = await client.getJson<AttachmentsResponse>(
		`/wiki/api/v2/pages/${encodeURIComponent(id)}/attachments?limit=250`,
	);
	return res.results.map((a) => ({
		filename: a.title ?? a.id,
		fileId: mediaNodeId(a),
		size: typeof a.fileSize === "number" ? a.fileSize : UNKNOWN_SIZE,
	}));
}

interface UploadResponse {
	results?: { title?: string; extensions?: { fileId?: string } }[];
}

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
	return (
		res.results?.[0]?.extensions?.fileId ?? (await fileIdByListing(client, pageId, filename))
	);
}

async function fileIdByListing(
	client: AtlassianClient,
	pageId: string,
	filename: string,
): Promise<string> {
	const listed = await listAttachments(client, pageId);
	const match = listed.find((a) => a.filename === filename);
	if (match) return match.fileId;
	throw new Error(`Upload of "${filename}" did not return a fileId.`);
}

export interface UpdatePageParams {
	title: string;
	nextVersion: number;
	body: AdfNode;
	message?: string;
}

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
		version: { number: params.nextVersion, message: params.message },
	});
	return res.version?.number ?? params.nextVersion;
}

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
			mediaId: mediaNodeId(a),
			filename: a.title ?? a.id,
			url: withWikiContextPath(a.downloadLink ?? ""),
		}));
}

function mediaNodeId(a: AttachmentResponse): string {
	return a.fileId ?? a.id;
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
			body: parseAdfJson(c.body?.atlas_doc_format?.value),
		})),
	);
}

function withWikiContextPath(link: string): string {
	if (link.startsWith("http") || link.startsWith("/wiki")) return link;
	return `/wiki${link}`;
}

function parseAdfJson(value: string | undefined): AdfNode | null {
	if (!value) return null;
	try {
		return JSON.parse(value) as AdfNode;
	} catch {
		return null;
	}
}

class UserNames {
	private readonly cache = new Map<string, string>();

	constructor(private readonly client: AtlassianClient) {}

	async resolve(accountId: string | undefined): Promise<string> {
		if (!accountId) return "";
		const cached = this.cache.get(accountId);
		if (cached !== undefined) return cached;
		const name = (await this.fetchDisplayName(accountId)) ?? accountId;
		this.cache.set(accountId, name);
		return name;
	}

	private async fetchDisplayName(accountId: string): Promise<string | null> {
		try {
			const user = await this.client.getJson<UserResponse>(
				`/wiki/rest/api/user?accountId=${encodeURIComponent(accountId)}`,
			);
			return user.displayName || null;
		} catch {
			return null;
		}
	}
}
