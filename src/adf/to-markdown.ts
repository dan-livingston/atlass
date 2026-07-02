import type { AdfMark, AdfNode, MediaAttrs } from "./types.ts";

export interface ToMarkdownOptions {
	// Map an ADF media node to a relative path (e.g. "PROJ-1.assets/img.png").
	// Return undefined to emit a text placeholder instead of an image link.
	resolveMedia?: (media: MediaAttrs) => string | undefined;
}

// Convert an ADF document (or any ADF node) to Markdown.
export function adfToMarkdown(
	doc: AdfNode | undefined | null,
	options: ToMarkdownOptions = {},
): string {
	if (!doc) return "";
	const ctx: Ctx = { resolveMedia: options.resolveMedia };
	const body =
		doc.type === "doc" ? renderBlocks(doc.content ?? [], ctx, "") : renderBlock(doc, ctx, "");
	return body.trim();
}

interface Ctx {
	resolveMedia?: (media: MediaAttrs) => string | undefined;
}

// Render a list of block nodes, separated by blank lines.
function renderBlocks(nodes: AdfNode[], ctx: Ctx, indent: string): string {
	return nodes
		.map((n) => renderBlock(n, ctx, indent))
		.filter((s) => s.length > 0)
		.join("\n\n");
}

function renderBlock(node: AdfNode, ctx: Ctx, indent: string): string {
	switch (node.type) {
		case "paragraph":
			return indent + renderInline(node.content ?? [], ctx);
		case "heading": {
			const level = clampLevel(node.attrs?.["level"]);
			return `${"#".repeat(level)} ${renderInline(node.content ?? [], ctx)}`;
		}
		case "bulletList":
			return renderList(node, ctx, indent, "bullet");
		case "orderedList":
			return renderList(node, ctx, indent, "ordered");
		case "taskList":
			return renderTaskList(node, ctx, indent);
		case "decisionList":
			return renderDecisionList(node, ctx, indent);
		case "codeBlock":
			return renderCodeBlock(node, indent);
		case "blockquote": {
			const inner = renderBlocks(node.content ?? [], ctx, "");
			return prefixLines(inner, `${indent}> `);
		}
		case "panel":
			return renderPanel(node, ctx, indent);
		case "rule":
			return `${indent}---`;
		case "table":
			return renderTable(node, ctx);
		case "mediaSingle":
		case "mediaGroup":
			return renderBlocks(node.content ?? [], ctx, indent);
		case "media":
			return indent + renderMedia(node, ctx);
		case "expand":
		case "nestedExpand":
			return renderExpand(node, ctx, indent);
		default:
			// Unknown block: render children if any, else drop with a marker.
			if (node.content?.length) return renderBlocks(node.content, ctx, indent);
			return node.text ? indent + node.text : "";
	}
}

function renderList(node: AdfNode, ctx: Ctx, indent: string, kind: "bullet" | "ordered"): string {
	const start = kind === "ordered" ? (toNumber(node.attrs?.["order"]) ?? 1) : 0;
	const items = (node.content ?? []).filter((n) => n.type === "listItem");
	return items
		.map((item, i) => {
			const marker = kind === "ordered" ? `${start + i}. ` : "- ";
			return renderListItem(item, ctx, indent, marker);
		})
		.join("\n");
}

// A list item's first block sits on the marker line; later blocks (including
// nested lists) are indented to line up under it.
function renderListItem(item: AdfNode, ctx: Ctx, indent: string, marker: string): string {
	const childIndent = `${indent}${" ".repeat(marker.length)}`;
	const blocks = item.content ?? [];
	const rendered = blocks.map((b, i) => renderBlock(b, ctx, i === 0 ? "" : childIndent));
	const parts: string[] = [];
	rendered.forEach((text, i) => {
		if (i === 0) parts.push(`${indent}${marker}${text}`);
		else parts.push(text);
	});
	return parts.join("\n");
}

function renderTaskList(node: AdfNode, ctx: Ctx, indent: string): string {
	return (node.content ?? [])
		.filter((n) => n.type === "taskItem")
		.map((item) => {
			const done = item.attrs?.["state"] === "DONE";
			return `${indent}- [${done ? "x" : " "}] ${renderInline(item.content ?? [], ctx)}`;
		})
		.join("\n");
}

function renderDecisionList(node: AdfNode, ctx: Ctx, indent: string): string {
	return (node.content ?? [])
		.filter((n) => n.type === "decisionItem")
		.map((item) => `${indent}- (decision) ${renderInline(item.content ?? [], ctx)}`)
		.join("\n");
}

function renderCodeBlock(node: AdfNode, indent: string): string {
	const lang =
		typeof node.attrs?.["language"] === "string" ? (node.attrs["language"] as string) : "";
	const code = (node.content ?? []).map((n) => n.text ?? "").join("");
	const fence = "```";
	return prefixLines(`${fence}${lang}\n${code}\n${fence}`, indent);
}

const PANEL_LABELS: Record<string, string> = {
	info: "Info",
	note: "Note",
	warning: "Warning",
	success: "Success",
	error: "Error",
};

function renderPanel(node: AdfNode, ctx: Ctx, indent: string): string {
	const type =
		typeof node.attrs?.["panelType"] === "string"
			? (node.attrs["panelType"] as string)
			: "info";
	const label = PANEL_LABELS[type] ?? "Note";
	const inner = renderBlocks(node.content ?? [], ctx, "");
	return prefixLines(`**${label}**\n\n${inner}`, `${indent}> `);
}

function renderExpand(node: AdfNode, ctx: Ctx, indent: string): string {
	const title =
		typeof node.attrs?.["title"] === "string" ? (node.attrs["title"] as string) : "Details";
	const inner = renderBlocks(node.content ?? [], ctx, "");
	return `${indent}<details><summary>${title}</summary>\n\n${inner}\n\n${indent}</details>`;
}

function renderTable(node: AdfNode, ctx: Ctx): string {
	const rows = (node.content ?? []).filter((n) => n.type === "tableRow");
	if (rows.length === 0) return "";
	const grid = rows.map((row) => (row.content ?? []).map((cell) => renderCell(cell, ctx)));
	const cols = Math.max(...grid.map((r) => r.length));
	const pad = (r: string[]): string[] => {
		const copy = [...r];
		while (copy.length < cols) copy.push("");
		return copy;
	};
	const header = pad(grid[0] ?? []);
	const lines = [`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`];
	for (const row of grid.slice(1)) lines.push(`| ${pad(row).join(" | ")} |`);
	return lines.join("\n");
}

// Table cells can hold block content, but Markdown cells are inline-only, so
// flatten to a single line and escape pipes.
function renderCell(cell: AdfNode, ctx: Ctx): string {
	const text = renderBlocks(cell.content ?? [], ctx, "")
		.replace(/\n+/g, " ")
		.replace(/\|/g, "\\|")
		.trim();
	return text;
}

function renderMedia(node: AdfNode, ctx: Ctx): string {
	const attrs = (node.attrs ?? {}) as MediaAttrs;
	const alt = attrs.alt ?? "";
	const resolved = ctx.resolveMedia?.(attrs);
	if (resolved) return `![${alt}](${resolved})`;
	const label = alt || attrs.id || "media";
	return `[embedded media: ${label}]`;
}

// ---- inline rendering ----

function renderInline(nodes: AdfNode[], ctx: Ctx): string {
	return nodes.map((n) => renderInlineNode(n, ctx)).join("");
}

function renderInlineNode(node: AdfNode, ctx: Ctx): string {
	switch (node.type) {
		case "text":
			return applyMarks(node.text ?? "", node.marks ?? []);
		case "hardBreak":
			return "  \n";
		case "mention": {
			const text =
				typeof node.attrs?.["text"] === "string" ? (node.attrs["text"] as string) : "";
			return text || "@unknown";
		}
		case "emoji": {
			const text = node.attrs?.["text"];
			if (typeof text === "string" && text.length > 0) return text;
			const short = node.attrs?.["shortName"];
			return typeof short === "string" ? short : "";
		}
		case "date":
			return formatDate(node.attrs?.["timestamp"]);
		case "status": {
			const text =
				typeof node.attrs?.["text"] === "string" ? (node.attrs["text"] as string) : "";
			return `\`[${text}]\``;
		}
		case "inlineCard": {
			const url = node.attrs?.["url"];
			if (typeof url === "string") return `[${url}](${url})`;
			return "";
		}
		case "media":
			return renderMedia(node, ctx);
		default:
			return node.text ?? "";
	}
}

// Wrap text in Markdown marks. Order matters: code innermost, link outermost.
function applyMarks(text: string, marks: AdfMark[]): string {
	if (text.length === 0) return text;
	let out = text;
	let href: string | undefined;
	for (const mark of marks) {
		switch (mark.type) {
			case "code":
				out = `\`${out}\``;
				break;
			case "strong":
				out = `**${out}**`;
				break;
			case "em":
				out = `*${out}*`;
				break;
			case "strike":
				out = `~~${out}~~`;
				break;
			case "link": {
				const value = mark.attrs?.["href"];
				if (typeof value === "string") href = value;
				break;
			}
			default:
				break;
		}
	}
	if (href) out = `[${out}](${href})`;
	return out;
}

// ---- helpers ----

function prefixLines(text: string, prefix: string): string {
	return text
		.split("\n")
		.map((line) => (line.length > 0 ? prefix + line : prefix.trimEnd()))
		.join("\n");
}

function clampLevel(value: unknown): number {
	const n = toNumber(value) ?? 1;
	return Math.min(6, Math.max(1, n));
}

function toNumber(value: unknown): number | undefined {
	return typeof value === "number" ? value : undefined;
}

function formatDate(timestamp: unknown): string {
	const ms =
		typeof timestamp === "string"
			? Number(timestamp)
			: typeof timestamp === "number"
				? timestamp
				: NaN;
	if (Number.isNaN(ms)) return "";
	return new Date(ms).toISOString().slice(0, 10);
}
