import type { RemoteAttachment } from "#/api/attachments.ts";
import type { Transport } from "#/api/client.ts";

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

export interface AttachmentInfo {
	filename: string;
	fileId: string;
	size: number;
}

const UNKNOWN_SIZE = -1;

export async function listAttachments(client: Transport, id: string): Promise<AttachmentInfo[]> {
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
	client: Transport,
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
	client: Transport,
	pageId: string,
	filename: string,
): Promise<string> {
	const listed = await listAttachments(client, pageId);
	const match = listed.find((a) => a.filename === filename);
	if (match) return match.fileId;
	throw new Error(`Upload of "${filename}" did not return a fileId.`);
}

export async function fetchAttachments(client: Transport, id: string): Promise<RemoteAttachment[]> {
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

function withWikiContextPath(link: string): string {
	if (link.startsWith("http") || link.startsWith("/wiki")) return link;
	return `/wiki${link}`;
}
