import type { AdfNode } from "../adf/types.ts";

// The parts of a copied Markdown file that an update needs: the page identity
// from frontmatter and the body between the H1 and the trailing sections.
export interface UpdateSource {
	id: string;
	version: number;
	// title from frontmatter (current server title at copy time)
	frontTitle: string;
	// text of the H1, pushed as the new title only when --title is set
	bodyTitle: string;
	// Markdown body, with frontmatter, the H1, and the Comments/Attachments
	// sections removed
	body: string;
}

// The parts of a copied Jira issue file that an update needs: the issue key and
// the copy-time `updated` timestamp (used to detect a stale copy), plus the body
// between the H1 and the trailing sections.
export interface JiraUpdateSource {
	key: string;
	// server `updated` timestamp at copy time; compared against the live issue to
	// refuse a stale update
	updated: string;
	// text of the H1, pushed as the new summary only when --summary is set
	bodyTitle: string;
	// Markdown body, with frontmatter, the H1, and the Comments/Attachments
	// sections removed
	body: string;
}

// Parse a copied Confluence page file back into its identity and body. Throws if
// the file is not a page copied by this tool (no frontmatter, missing id).
export function parseUpdateSource(content: string): UpdateSource {
	const { fields, bodyTitle, body } = splitFile(content);

	const id = fields["id"];
	if (!id) throw new Error("Frontmatter is missing the page `id`; re-copy the page.");
	const version = Number(fields["version"]);
	if (!Number.isFinite(version)) {
		throw new Error("Frontmatter is missing a numeric `version`; re-copy the page.");
	}

	return { id, version, frontTitle: fields["title"] ?? "", bodyTitle, body };
}

// Parse a copied Jira issue file back into its identity and body. Throws if the
// file is not an issue copied by this tool (no frontmatter, missing key).
export function parseJiraUpdateSource(content: string): JiraUpdateSource {
	const { fields, bodyTitle, body } = splitFile(content);

	const key = fields["key"];
	if (!key) throw new Error("Frontmatter is missing the issue `key`; re-copy the issue.");

	return { key, updated: fields["updated"] ?? "", bodyTitle, body };
}

// Split a copied file into its frontmatter fields, H1 title, and body. Shared by
// the Confluence and Jira update parsers, which layer their own identity checks
// on top.
function splitFile(content: string): {
	fields: Record<string, string>;
	bodyTitle: string;
	body: string;
} {
	const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
	if (!match) {
		throw new Error("Not an atlass file: no YAML frontmatter found.");
	}
	const fields = parseFrontmatter(match[1] ?? "");
	const rest = content.slice(match[0].length);
	const { bodyTitle, body } = splitBody(rest, fields["title"] ?? "");
	return { fields, bodyTitle, body };
}

// Minimal frontmatter reader for the scalars this tool writes: quoted strings
// and bare numbers. Arrays (e.g. Jira labels) are ignored; pages have none.
function parseFrontmatter(block: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const line of block.split("\n")) {
		const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
		if (!m) continue;
		const key = m[1] ?? "";
		let value = (m[2] ?? "").trim();
		if (value.startsWith('"') && value.endsWith('"')) {
			value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
		}
		out[key] = value;
	}
	return out;
}

// Separate the H1 title from the body and drop the trailing Comments and
// Attachments sections that the copy appended (they are not page content).
function splitBody(rest: string, fallbackTitle: string): { bodyTitle: string; body: string } {
	const lines = rest.split("\n");
	let bodyTitle = fallbackTitle;
	let start = 0;

	// find the H1; everything before it is blank
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";
		if (line.startsWith("# ")) {
			bodyTitle = line.slice(2).trim();
			start = i + 1;
			break;
		}
		if (line.trim().length > 0) break; // content before any H1: no title line
	}

	// cut at the first trailing section heading
	let end = lines.length;
	for (let i = start; i < lines.length; i++) {
		if (/^## (Comments|Attachments)\s*$/.test(lines[i] ?? "")) {
			end = i;
			break;
		}
	}

	const body = lines.slice(start, end).join("\n").trim();
	return { bodyTitle, body };
}

// ADF node types that flatten to ordinary Markdown on copy and so cannot round
// trip. Mapped to a human label; several ADF types share one label.
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

// Jira update does not yet re-upload images, so a server description that embeds
// media would silently lose it on a Markdown round trip. Count the leaf media
// nodes (not the mediaSingle/mediaGroup wrappers, which would double count) so
// the update warns before dropping them.
export const JIRA_LOSSY_LABELS: Record<string, string> = {
	...LOSSY_LABELS,
	media: "image",
	mediaInline: "image",
};

// Walk a server ADF body and count the structural nodes that a Markdown update
// would drop, keyed by label so an update can warn "panel, 2 macros". The label
// set varies by product (Jira also treats media as lossy); defaults to the
// Confluence set.
export function findLossyNodes(
	node: AdfNode | null | undefined,
	labels: Record<string, string> = LOSSY_LABELS,
): Map<string, number> {
	const counts = new Map<string, number>();
	const visit = (n: AdfNode): void => {
		const label = labels[n.type];
		if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
		for (const child of n.content ?? []) visit(child);
	};
	if (node) visit(node);
	return counts;
}

// Format the lossy counts for a warning line, e.g. "1 panel, 2 macros".
export function formatLossy(counts: Map<string, number>): string {
	return [...counts.entries()]
		.map(([label, n]) => `${n} ${label}${n === 1 ? "" : "s"}`)
		.join(", ");
}
