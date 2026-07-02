import type { AdfNode, MediaAttrs } from "../adf/types.ts";
import type { DownloadedAttachment } from "../api/attachments.ts";

import { adfToMarkdown } from "../adf/to-markdown.ts";

export interface Comment {
	author: string;
	created: string;
	body: AdfNode | null;
}

// Build a media resolver for the ADF converter. Confluence media nodes carry
// the attachment fileId in attrs.id; Jira nodes often only carry a filename in
// attrs.alt. Try both so inline images resolve on either service.
export function mediaResolver(
	downloaded: DownloadedAttachment[],
): (media: MediaAttrs) => string | undefined {
	const byId = new Map(downloaded.map((d) => [d.id, d.relativePath]));
	const byName = new Map(downloaded.map((d) => [d.filename, d.relativePath]));
	return (media) => {
		if (media.id && byId.has(media.id)) return byId.get(media.id);
		if (media.alt && byName.has(media.alt)) return byName.get(media.alt);
		return undefined;
	};
}

// Serialize a YAML frontmatter block. Values are strings, string arrays, or
// numbers; strings are always quoted to stay valid regardless of content.
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

// Render an "## Attachments" section linking every downloaded file, so nothing
// is lost even when an inline media node could not be matched.
export function attachmentsSection(downloaded: DownloadedAttachment[]): string {
	if (downloaded.length === 0) return "";
	const items = downloaded.map((d) => `- [${d.filename}](${d.relativePath})`);
	return ["## Attachments", "", ...items].join("\n");
}

// Render a "## Comments" section. Each comment gets an author/date subheading
// followed by its body converted to Markdown.
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

// Format an ISO timestamp as "YYYY-MM-DD HH:mm"; pass through if unparseable.
export function formatDate(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	return date.toISOString().replace("T", " ").slice(0, 16);
}

// Join document sections with blank lines, dropping empties.
export function joinSections(sections: string[]): string {
	return `${sections.filter((s) => s.trim().length > 0).join("\n\n")}\n`;
}
