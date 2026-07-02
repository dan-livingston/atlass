import type { AdfNode } from "../adf/types.ts";
import type { RemoteAttachment } from "./attachments.ts";
import type { AtlassianClient } from "./client.ts";

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
	results: { fileId?: string; id: string; title?: string; downloadLink?: string }[];
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
