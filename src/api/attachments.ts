import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import type { MediaAttrs } from "../adf/types.ts";
import type { AtlassianClient } from "./client.ts";

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

export async function downloadAttachments(
	client: AtlassianClient,
	attachments: RemoteAttachment[],
	assetsDir: string,
	assetsDirName: string,
): Promise<DownloadedAttachment[]> {
	if (attachments.length === 0) return [];
	await mkdir(assetsDir, { recursive: true });

	const used = new Set<string>();
	const results: DownloadedAttachment[] = [];
	for (const att of attachments) {
		const savedAs = uniqueName(bareFilename(att.filename), used);
		try {
			const bytes = await client.getBinary(att.url);
			await writeFile(join(assetsDir, savedAs), bytes);
			results.push({ ...att, relativePath: `${assetsDirName}/${savedAs}` });
		} catch (err) {
			console.warn(`  ! could not download ${att.filename}: ${(err as Error).message}`);
		}
	}
	return results;
}

function bareFilename(name: string): string {
	return basename(name).replace(/[/\\]/g, "_") || "attachment";
}

function uniqueName(name: string, used: Set<string>): string {
	let candidate = name;
	for (let suffix = 1; used.has(candidate); suffix++) candidate = numberedName(name, suffix);
	used.add(candidate);
	return candidate;
}

function numberedName(name: string, suffix: number): string {
	const dot = name.lastIndexOf(".");
	const stem = dot > 0 ? name.slice(0, dot) : name;
	const ext = dot > 0 ? name.slice(dot) : "";
	return `${stem}-${suffix}${ext}`;
}
