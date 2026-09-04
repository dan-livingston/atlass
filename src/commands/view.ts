import kleur from "kleur";

import type { AdfNode } from "#/adf/types.ts";
import type { RemoteAttachment } from "#/api/attachments.ts";

import { adfToMarkdown } from "#/adf/to-markdown.ts";
import { highlightMarkdown } from "#/markdown/highlight.ts";
import { formatDateTime, relativeTime } from "#/util/format.ts";

export interface ViewOptions {
	allComments?: boolean;
	pager?: boolean;
}

export interface ViewComment {
	author: string;
	created: string;
	body: AdfNode | null;
}

export interface RenderedComment {
	author: string;
	created: string;
	markdown: string;
	anchor?: string;
}

export interface CommentSectionOptions {
	allComments?: boolean;
	truncated?: boolean;
}

const VISIBLE_COMMENTS = 5;

export function fieldLines(pairs: [string, string][]): string[] {
	const kept = pairs.filter(([, value]) => value !== "");
	const width = Math.max(...kept.map(([label]) => label.length)) + 1;
	return kept.map(([label, value]) => `${kleur.dim(`${label}:`.padEnd(width))}  ${value}`);
}

export function dateWithAge(iso: string, nowMs: number): string {
	if (!iso) return "";
	return `${formatDateTime(iso).slice(0, 10)} (${relativeTime(iso, nowMs)})`;
}

export function markdownBody(md: string): string[] {
	return md ? ["", highlightMarkdown(md)] : [];
}

export function bodyLines(body: AdfNode | null): string[] {
	return markdownBody(adfToMarkdown(body));
}

export function renderedComments(comments: ViewComment[]): RenderedComment[] {
	return comments.map((comment) => ({
		author: comment.author,
		created: comment.created,
		markdown: adfToMarkdown(comment.body),
	}));
}

export function commentSection(
	comments: RenderedComment[],
	options: CommentSectionOptions,
): string[] {
	if (comments.length === 0) return [];
	const visible = options.allComments ? comments : comments.slice(-VISIBLE_COMMENTS);
	const hidden = comments.length - visible.length;
	const count = options.truncated ? `${comments.length}+` : String(comments.length);
	const heading =
		hidden > 0
			? `Comments (${count}, showing last ${visible.length} — --all-comments for all)`
			: `Comments (${count})`;
	const lines = ["", kleur.bold(heading)];
	for (const comment of visible) {
		lines.push(
			"",
			commentHeader(comment),
			...(comment.markdown ? [highlightMarkdown(comment.markdown)] : []),
		);
	}
	return lines;
}

function commentHeader(comment: RenderedComment): string {
	const author = kleur.bold(comment.author || "Unknown");
	const when = comment.created ? ` · ${kleur.dim(formatDateTime(comment.created))}` : "";
	const where = comment.anchor ? ` · ${kleur.dim(comment.anchor)}` : "";
	return `─ ${author}${when}${where}`;
}

export function attachmentSection(attachments: RemoteAttachment[]): string[] {
	if (attachments.length === 0) return [];
	return ["", kleur.bold("Attachments"), ...attachments.map((a) => `- ${a.filename}`)];
}
