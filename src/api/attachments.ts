import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import type { AtlassianClient } from "./client.ts";

export interface RemoteAttachment {
	// stable key used to match ADF media nodes to a downloaded file
	id: string;
	filename: string;
	url: string;
}

export interface DownloadedAttachment extends RemoteAttachment {
	// path relative to the Markdown file, e.g. "PROJ-1.assets/img.png"
	relativePath: string;
}

// Download every attachment into `<assetsDir>` and return the mapping the
// converter needs to turn media nodes into relative image links. Failures are
// reported but never abort the copy.
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
		const savedAs = uniqueName(safeName(att.filename), used);
		try {
			const bytes = await client.getBinary(att.url);
			await writeFile(join(assetsDir, savedAs), bytes);
			// keep the original filename for display and alt-matching
			results.push({ ...att, relativePath: `${assetsDirName}/${savedAs}` });
		} catch (err) {
			console.warn(`  ! could not download ${att.filename}: ${(err as Error).message}`);
		}
	}
	return results;
}

// Strip path separators and keep the bare filename.
function safeName(name: string): string {
	return basename(name).replace(/[/\\]/g, "_") || "attachment";
}

// Disambiguate collisions by suffixing -1, -2, ...
function uniqueName(name: string, used: Set<string>): string {
	if (!used.has(name)) {
		used.add(name);
		return name;
	}
	const dot = name.lastIndexOf(".");
	const stem = dot > 0 ? name.slice(0, dot) : name;
	const ext = dot > 0 ? name.slice(dot) : "";
	let i = 1;
	let candidate = `${stem}-${i}${ext}`;
	while (used.has(candidate)) {
		i += 1;
		candidate = `${stem}-${i}${ext}`;
	}
	used.add(candidate);
	return candidate;
}
