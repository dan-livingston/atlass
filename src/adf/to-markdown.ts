import type { AdfNode, MediaAttrs } from "#/adf/types.ts";

import { renderInline, renderMedia } from "#/adf/to-markdown-inline.ts";

export interface ToMarkdownOptions {
	resolveMedia?: (media: MediaAttrs) => string | undefined;
}

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

export interface Ctx {
	resolveMedia?: (media: MediaAttrs) => string | undefined;
}

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

function renderListItem(item: AdfNode, ctx: Ctx, indent: string, marker: string): string {
	const continuationIndent = `${indent}${" ".repeat(marker.length)}`;
	return (item.content ?? [])
		.map((block, i) =>
			i === 0
				? `${indent}${marker}${renderBlock(block, ctx, "")}`
				: renderBlock(block, ctx, continuationIndent),
		)
		.join("\n");
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
	const grid = rows.map((row) =>
		(row.content ?? []).map((cell) => renderCellOnOneLine(cell, ctx)),
	);
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

function renderCellOnOneLine(cell: AdfNode, ctx: Ctx): string {
	return renderBlocks(cell.content ?? [], ctx, "")
		.replace(/\n+/g, " ")
		.replace(/\|/g, "\\|")
		.trim();
}

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
