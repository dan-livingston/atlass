import type { AdfNode } from "../adf/types.ts";

export interface PageUpdateSource {
	id: string;
	version: number;
	frontmatterTitle: string;
	h1Title: string;
	body: string;
}

export interface JiraUpdateSource {
	key: string;
	updatedAtCopy: string;
	h1Title: string;
	body: string;
}

interface CopiedFile {
	fields: Record<string, string>;
	h1Title: string;
	body: string;
}

const FRONTMATTER_BLOCK = /^---\n([\s\S]*?)\n---\n?/;
const FRONTMATTER_SCALAR = /^([A-Za-z0-9_]+):\s*(.*)$/;
const TRAILING_SECTION_HEADING = /^## (Comments|Attachments)\s*$/;

export function parsePageUpdateSource(content: string): PageUpdateSource {
	const { fields, h1Title, body } = splitCopiedFile(content);

	const id = fields["id"];
	if (!id) throw new Error("Frontmatter is missing the page `id`; re-copy the page.");
	const version = Number(fields["version"]);
	if (!Number.isFinite(version)) {
		throw new Error("Frontmatter is missing a numeric `version`; re-copy the page.");
	}

	return { id, version, frontmatterTitle: fields["title"] ?? "", h1Title, body };
}

export function parseJiraUpdateSource(content: string): JiraUpdateSource {
	const { fields, h1Title, body } = splitCopiedFile(content);

	const key = fields["key"];
	if (!key) throw new Error("Frontmatter is missing the issue `key`; re-copy the issue.");

	return { key, updatedAtCopy: fields["updated"] ?? "", h1Title, body };
}

function splitCopiedFile(content: string): CopiedFile {
	const match = content.match(FRONTMATTER_BLOCK);
	if (!match) {
		throw new Error("Not an atlass file: no YAML frontmatter found.");
	}
	const fields = parseScalarFrontmatter(match[1] ?? "");
	const rest = content.slice(match[0].length);
	const { h1Title, body } = splitTitleAndBody(rest, fields["title"] ?? "");
	return { fields, h1Title, body };
}

function parseScalarFrontmatter(block: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const line of block.split("\n")) {
		const m = line.match(FRONTMATTER_SCALAR);
		if (!m) continue;
		out[m[1] ?? ""] = unquote((m[2] ?? "").trim());
	}
	return out;
}

function unquote(value: string): string {
	if (!value.startsWith('"') || !value.endsWith('"')) return value;
	return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

function splitTitleAndBody(rest: string, fallbackTitle: string): { h1Title: string; body: string } {
	const lines = rest.split("\n");
	const h1 = leadingH1(lines);
	const start = h1 ? h1.index + 1 : 0;
	const trailing = lines.findIndex(
		(line, i) => i >= start && TRAILING_SECTION_HEADING.test(line),
	);
	const end = trailing === -1 ? lines.length : trailing;
	return { h1Title: h1?.title ?? fallbackTitle, body: lines.slice(start, end).join("\n").trim() };
}

function leadingH1(lines: string[]): { index: number; title: string } | null {
	for (const [index, line] of lines.entries()) {
		if (line.startsWith("# ")) return { index, title: line.slice(2).trim() };
		if (line.trim().length > 0) return null;
	}
	return null;
}

const LOSSY_LABELS: Record<string, string> = {
	panel: "panel",
	expand: "expand",
	nestedExpand: "expand",
	decisionList: "decision list",
	layoutSection: "layout",
	extension: "macro",
	bodiedExtension: "macro",
	inlineExtension: "macro",
};

export const JIRA_LOSSY_LABELS: Record<string, string> = {
	...LOSSY_LABELS,
	media: "image",
	mediaInline: "image",
};

export function findLossyNodes(
	node: AdfNode | null | undefined,
	lossyLabels: Record<string, string> = LOSSY_LABELS,
): Map<string, number> {
	const counts = new Map<string, number>();
	const visit = (n: AdfNode): void => {
		const label = lossyLabels[n.type];
		if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
		for (const child of n.content ?? []) visit(child);
	};
	if (node) visit(node);
	return counts;
}

export function formatLossy(counts: Map<string, number>): string {
	return [...counts.entries()]
		.map(([label, n]) => `${n} ${label}${n === 1 ? "" : "s"}`)
		.join(", ");
}
