import type { AdfNode } from "#/adf/types.ts";
import type { RemoteAttachment } from "#/api/attachments.ts";
import type { AtlassianClient } from "#/api/client.ts";

import { fetchAttachments } from "#/api/confluence-attachments.ts";

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
