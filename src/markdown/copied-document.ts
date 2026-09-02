import { formatDateTime } from "#/util/format.ts";

export type FrontmatterValue = string | number | string[];

export interface CopiedSource {
	fields: Record<string, FrontmatterValue>;
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

const COMMENTS_HEADING = "## Comments";
const ATTACHMENTS_HEADING = "## Attachments";
const FRONTMATTER_BLOCK = /^---\n([\s\S]*?)\n---\n?/;
const FRONTMATTER_KEY = /^([A-Za-z0-9_]+):\s*(.*)$/;
const FRONTMATTER_LIST_ITEM = /^ {2}- (.*)$/;
const BARE_NUMBER = /^-?\d+(\.\d+)?$/;
const TRAILING_SECTION_HEADING = /^## (Comments|Attachments)\s*$/;

export function render(doc: CopiedDoc): string {
	const sections = [
		frontmatter(doc.fields),
		`# ${doc.title}`,
		doc.body,
		commentsSection(doc.comments),
		attachmentsSection(doc.attachments),
	];
	return `${sections.filter((s) => s.trim().length > 0).join("\n\n")}\n`;
}

export function parse(text: string): CopiedSource {
	const match = text.match(FRONTMATTER_BLOCK);
	if (!match) {
		throw new Error("Not an atlass file: no YAML frontmatter found.");
	}
	const fields = parseFrontmatter(match[1] ?? "");
	const lines = text.slice(match[0].length).split("\n");
	const h1 = leadingH1(lines);
	const start = h1 ? h1.index + 1 : 0;
	const trailing = lines.findIndex(
		(line, i) => i >= start && TRAILING_SECTION_HEADING.test(line),
	);
	const end = trailing === -1 ? lines.length : trailing;
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

function scalarString(value: FrontmatterValue | undefined): string {
	if (typeof value === "string") return value;
	if (typeof value === "number") return String(value);
	return "";
}

function frontmatter(fields: Record<string, FrontmatterValue>): string {
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

function parseFrontmatter(block: string): Record<string, FrontmatterValue> {
	const fields: Record<string, FrontmatterValue> = {};
	const lines = block.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const m = lines[i]?.match(FRONTMATTER_KEY);
		if (!m) continue;
		const key = m[1] ?? "";
		const raw = (m[2] ?? "").trim();
		if (raw === "[]") {
			fields[key] = [];
		} else if (raw === "") {
			const items: string[] = [];
			for (let item; (item = lines[i + 1]?.match(FRONTMATTER_LIST_ITEM)); i++) {
				items.push(unquote((item[1] ?? "").trim()));
			}
			fields[key] = items;
		} else {
			fields[key] = scalar(raw);
		}
	}
	return fields;
}

function scalar(raw: string): string | number {
	if (raw.startsWith('"')) return unquote(raw);
	if (BARE_NUMBER.test(raw)) return Number(raw);
	return raw;
}

function quote(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function unquote(value: string): string {
	if (!value.startsWith('"') || !value.endsWith('"')) return value;
	return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

function leadingH1(lines: string[]): { index: number; title: string } | null {
	for (const [index, line] of lines.entries()) {
		if (line.startsWith("# ")) return { index, title: line.slice(2).trim() };
		if (line.trim().length > 0) return null;
	}
	return null;
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
