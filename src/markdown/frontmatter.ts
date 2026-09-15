import { editKeepingLayout } from "#/markdown/text-layout.ts";

export type FrontmatterValue = string | number | string[];

export type Fields = Record<string, FrontmatterValue>;

const BLOCK = /^---\n([\s\S]*?)\n---\n?/;
const KEY = /^([A-Za-z0-9_]+):\s*(.*)$/;
const LIST_ITEM = /^ {2}- (.*)$/;
const BARE_NUMBER = /^-?\d+(\.\d+)?$/;

export interface Frontmatter {
	fields: Fields;
	rest: string;
}

export function splitFrontmatter(text: string): Frontmatter | null {
	const match = text.match(BLOCK);
	if (!match) return null;
	return { fields: parseFields(match[1] ?? ""), rest: text.slice(match[0].length) };
}

export function formatFrontmatter(fields: Fields): string {
	const lines = Object.entries(fields).flatMap(([key, value]) => fieldLines(key, value));
	return ["---", ...lines, "---"].join("\n");
}

export function rewriteFields(raw: string, fields: Fields): string {
	return editKeepingLayout(raw, (text) => withFields(text, fields));
}

export function withFields(text: string, fields: Fields): string {
	const match = text.match(BLOCK);
	if (!match) return `${formatFrontmatter(fields)}\n\n${text}`;
	const lines = (match[1] ?? "").split("\n");
	const pending = new Map(Object.entries(fields));
	const kept: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";
		const key = line.match(KEY)?.[1];
		const value = key === undefined ? undefined : pending.get(key);
		if (key === undefined || value === undefined) {
			kept.push(line);
			continue;
		}
		kept.push(...fieldLines(key, value));
		pending.delete(key);
		while (LIST_ITEM.test(lines[i + 1] ?? "")) i++;
	}
	for (const [key, value] of pending) kept.push(...fieldLines(key, value));
	const closing = match[0].endsWith("\n") ? "\n" : "";
	return `---\n${kept.join("\n")}\n---${closing}${text.slice(match[0].length)}`;
}

function fieldLines(key: string, value: FrontmatterValue): string[] {
	if (Array.isArray(value)) {
		return value.length === 0
			? [`${key}: []`]
			: [`${key}:`, ...value.map((v) => `  - ${quote(v)}`)];
	}
	return [`${key}: ${typeof value === "number" ? value : quote(value)}`];
}

function parseFields(block: string): Fields {
	const fields: Fields = {};
	const lines = block.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const m = lines[i]?.match(KEY);
		if (!m) continue;
		const key = m[1] ?? "";
		const raw = (m[2] ?? "").trim();
		if (raw === "[]") {
			fields[key] = [];
		} else if (raw === "") {
			const items: string[] = [];
			for (let item; (item = lines[i + 1]?.match(LIST_ITEM)); i++) {
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
