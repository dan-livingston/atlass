import type { Attached } from "#/api/attachments.ts";
import type { Transport } from "#/api/client.ts";

import { mediaType } from "#/api/media-type.ts";

type UploadResponse = { id: string; filename: string; size: number }[];

export async function attachToIssue(
	client: Transport,
	key: string,
	filename: string,
	bytes: Uint8Array,
): Promise<Attached> {
	const res = await client.postMultipart<UploadResponse>(
		`/rest/api/3/issue/${encodeURIComponent(key)}/attachments`,
		filename,
		bytes,
		{ type: mediaType(filename) },
	);
	const [first] = res;
	if (!first) throw new Error(`Upload of "${filename}" returned no attachment.`);
	return { filename: first.filename, id: first.id, size: first.size };
}
