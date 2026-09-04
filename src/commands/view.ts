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
	trailer?: string;
}

export type RenderedThread = RenderedComment[];

export interface CommentSectionOptions {
	allComments?: boolean;
	truncated?: boolean;
}

const VISIBLE_THREADS = 5;
const INDENT = "  ";

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

export function renderedComments(comments: ViewComment[]): RenderedThread[] {
	return comments.map((comment) => [
		{
			author: comment.author,
			created: comment.created,
			markdown: adfToMarkdown(comment.body),
		},
	]);
}

export function commentSection(
	threads: RenderedThread[],
	options: CommentSectionOptions,
): string[] {
	const total = threads.reduce((running, thread) => running + thread.length, 0);
	if (total === 0) return [];
	const visible = options.allComments ? threads : threads.slice(-VISIBLE_THREADS);
	const lines = ["", kleur.bold(commentHeading(total, threads.length, visible.length, options))];
	for (const thread of visible) {
		thread.forEach((comment, index) => {
			lines.push(
				"",
				commentHeader(comment, index > 0),
				...commentBody(comment, index > 0),
				...commentTrailer(comment),
			);
		});
	}
	return lines;
}

function commentHeading(
	total: number,
	threads: number,
	visible: number,
	options: CommentSectionOptions,
): string {
	const count = options.truncated ? `${total}+` : String(total);
	if (visible === threads) return `Comments (${count})`;
	if (threads === total) {
		return `Comments (${count}, showing last ${visible} — --all-comments for all)`;
	}
	return (
		`Comments (${count} in ${threads} threads, showing last ${visible} threads ` +
		"— --all-comments for all)"
	);
}

function commentHeader(comment: RenderedComment, reply: boolean): string {
	const author = kleur.bold(comment.author || "Unknown");
	const when = comment.created ? ` · ${kleur.dim(formatDateTime(comment.created))}` : "";
	const where = comment.anchor ? ` · ${kleur.dim(comment.anchor)}` : "";
	return `${reply ? `${INDENT}↳ ` : "─ "}${author}${when}${where}`;
}

function commentBody(comment: RenderedComment, reply: boolean): string[] {
	if (!comment.markdown) return [];
	const body = highlightMarkdown(comment.markdown);
	if (!reply) return [body];
	return [
		body
			.split("\n")
			.map((line) => (line ? `${INDENT}${line}` : line))
			.join("\n"),
	];
}

function commentTrailer(comment: RenderedComment): string[] {
	return comment.trailer ? ["", comment.trailer] : [];
}

export function attachmentSection(attachments: RemoteAttachment[]): string[] {
	if (attachments.length === 0) return [];
	return ["", kleur.bold("Attachments"), ...attachments.map((a) => `- ${a.filename}`)];
}
