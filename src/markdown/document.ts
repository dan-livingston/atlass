import type { AdfNode, MediaAttrs } from "../adf/types.ts";
import type { DownloadedAttachment } from "../api/attachments.ts";

import { adfToMarkdown } from "../adf/to-markdown.ts";

export interface Comment {
	author: string;
	created: string;
	body: AdfNode | null;
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

export function frontmatter(fields: Record<string, string | string[] | number>): string {
	const lines: string[] = ["---"];
	for (const [key, value] of Object.entries(fields)) {
		if (Array.isArray(value)) {
			if (value.length === 0) lines.push(`${key}: []`);
			else lines.push(`${key}:`, ...value.map((v) => `  - ${quote(v)}`));
		} else if (typeof value === "number") {
			lines.push(`${key}: ${value}`);
		} else {
			lines.push(`${key}: ${quote(value)}`);
		}
	}
	lines.push("---");
	return lines.join("\n");
}

function quote(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function attachmentsSection(downloaded: DownloadedAttachment[]): string {
	if (downloaded.length === 0) return "";
	const items = downloaded.map((d) => `- [${d.filename}](${d.relativePath})`);
	return ["## Attachments", "", ...items].join("\n");
}

export function commentsSection(
	comments: Comment[],
	resolveMedia: (media: MediaAttrs) => string | undefined,
): string {
	if (comments.length === 0) return "";
	const blocks = comments.map((c) => {
		const heading = `### ${c.author || "Unknown"}${c.created ? ` - ${formatDate(c.created)}` : ""}`;
		const body = adfToMarkdown(c.body, { resolveMedia });
		return body ? `${heading}\n\n${body}` : heading;
	});
	return ["## Comments", "", blocks.join("\n\n")].join("\n");
}

export function formatDate(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	return date.toISOString().replace("T", " ").slice(0, 16);
}

export function joinSections(sections: string[]): string {
	return `${sections.filter((s) => s.trim().length > 0).join("\n\n")}\n`;
}
