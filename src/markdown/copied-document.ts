import type { Fields, Frontmatter, FrontmatterValue } from "#/markdown/frontmatter.ts";

import { formatFrontmatter, splitFrontmatter } from "#/markdown/frontmatter.ts";
import { normalized } from "#/markdown/text-layout.ts";
import { formatDateTime } from "#/util/format.ts";

export interface CopiedSource {
	fields: Fields;
	title: string;
	body: string;
}

export interface CopiedComment {
	author: string;
	created: string;
	body: string;
}

export interface CopiedAttachment {
	filename: string;
	relativePath: string;
}

export interface CopiedDoc extends CopiedSource {
	comments: CopiedComment[];
	attachments: CopiedAttachment[];
}

export interface IssueSource extends CopiedSource {
	key: string;
	updatedAtCopy: string;
}

export interface PageSource extends CopiedSource {
	id: string;
	version: number;
}

const GENERATED_MARKER = "<!-- atlass:generated -->";
const COMMENTS_HEADING = "## Comments";
const ATTACHMENTS_HEADING = "## Attachments";
const LEGACY_SECTION_HEADING = /^## (Comments|Attachments)\s*$/;

export function render(doc: CopiedDoc): string {
	const sections = [
		formatFrontmatter(doc.fields),
		`# ${doc.title}`,
		doc.body,
		GENERATED_MARKER,
		commentsSection(doc.comments),
		attachmentsSection(doc.attachments),
	];
	return `${sections.filter((s) => s.trim().length > 0).join("\n\n")}\n`;
}

export function parse(raw: string): CopiedSource {
	const split = splitFrontmatter(normalized(raw));
	if (!split) {
		throw new Error("Not an atlass file: no YAML frontmatter found.");
	}
	return sourceOf(split, "marker-or-legacy-heading");
}

export function parseDraft(raw: string): CopiedSource {
	const text = normalized(raw);
	return sourceOf(splitFrontmatter(text) ?? { fields: {}, rest: text }, "marker");
}

export function withGeneratedMarker(text: string): string {
	if (text.split("\n").some(isMarker)) return text;
	return `${text.trimEnd()}\n\n${GENERATED_MARKER}\n`;
}

type BodyEnd = "marker" | "marker-or-legacy-heading";

function sourceOf({ fields, rest }: Frontmatter, ending: BodyEnd): CopiedSource {
	const lines = rest.split("\n");
	const h1 = leadingH1(lines);
	const start = h1 ? h1.index + 1 : 0;
	const end = bodyEnd(lines, start, ending);
	const fallbackTitle = typeof fields["title"] === "string" ? fields["title"] : "";
	return {
		fields,
		title: h1?.title ?? fallbackTitle,
		body: lines.slice(start, end).join("\n").trim(),
	};
}

export function parseIssueSource(text: string): IssueSource {
	const source = parse(text);
	const key = scalarString(source.fields["key"]);
	if (!key) throw new Error("Frontmatter is missing the issue `key`; re-copy the issue.");
	return { ...source, key, updatedAtCopy: scalarString(source.fields["updated"]) };
}

export function parsePageSource(text: string): PageSource {
	const source = parse(text);
	const id = scalarString(source.fields["id"]);
	if (!id) throw new Error("Frontmatter is missing the page `id`; re-copy the page.");
	const rawVersion = scalarString(source.fields["version"]);
	const version = rawVersion === "" ? Number.NaN : Number(rawVersion);
	if (!Number.isFinite(version)) {
		throw new Error("Frontmatter is missing a numeric `version`; re-copy the page.");
	}
	return { ...source, id, version };
}

export function scalarString(value: FrontmatterValue | undefined): string {
	if (typeof value === "string") return value;
	if (typeof value === "number") return String(value);
	return "";
}

function leadingH1(lines: string[]): { index: number; title: string } | null {
	for (const [index, line] of lines.entries()) {
		if (line.startsWith("# ")) return { index, title: line.slice(2).trim() };
		if (line.trim().length > 0) return null;
	}
	return null;
}

function bodyEnd(lines: string[], start: number, ending: BodyEnd): number {
	const after = (test: (line: string) => boolean) =>
		lines.findIndex((line, i) => i >= start && test(line));
	const marker = after(isMarker);
	if (marker !== -1) return marker;
	const legacy = ending === "marker" ? -1 : after((line) => LEGACY_SECTION_HEADING.test(line));
	return legacy === -1 ? lines.length : legacy;
}

function isMarker(line: string): boolean {
	return line.trimEnd() === GENERATED_MARKER;
}

function commentsSection(comments: CopiedComment[]): string {
	if (comments.length === 0) return "";
	const blocks = comments.map((c) => {
		const heading = `### ${c.author || "Unknown"}${c.created ? ` - ${formatDateTime(c.created)}` : ""}`;
		return c.body ? `${heading}\n\n${c.body}` : heading;
	});
	return [COMMENTS_HEADING, "", blocks.join("\n\n")].join("\n");
}

function attachmentsSection(attachments: CopiedAttachment[]): string {
	if (attachments.length === 0) return "";
	const items = attachments.map((a) => `- [${a.filename}](${a.relativePath})`);
	return [ATTACHMENTS_HEADING, "", ...items].join("\n");
}
