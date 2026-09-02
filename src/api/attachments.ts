import type { MediaAttrs } from "../adf/types.ts";

export interface RemoteAttachment {
	mediaId: string;
	filename: string;
	url: string;
}

export interface DownloadedAttachment extends RemoteAttachment {
	relativePath: string;
}

export function mediaResolver(
	downloaded: DownloadedAttachment[],
): (media: MediaAttrs) => string | undefined {
	const byMediaId = new Map(downloaded.map((d) => [d.mediaId, d.relativePath]));
	const byFilename = new Map(downloaded.map((d) => [d.filename, d.relativePath]));
	return (media) => {
		if (media.id && byMediaId.has(media.id)) return byMediaId.get(media.id);
		if (media.alt && byFilename.has(media.alt)) return byFilename.get(media.alt);
		return undefined;
	};
}
