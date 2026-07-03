import type { Token, Tokens } from "marked";

import { marked } from "marked";
import { randomUUID } from "node:crypto";

import type { AdfMark, AdfNode } from "./types.ts";

export interface FromMarkdownOptions {
	// Turn an image into a block-level ADF node (typically a mediaSingle). Return
	// undefined to drop the image. Defaults to an external media node using the
	// href verbatim; the update command overrides this to upload local files.
	resolveImage?: (href: string, alt: string) => AdfNode | undefined;
}

interface Ctx {
	resolveImage: (href: string, alt: string) => AdfNode | undefined;
}

// Convert Markdown to an ADF document. Handles the clean subset that
// `to-markdown.ts` emits (paragraphs, headings, lists, task lists, code,
// blockquotes, rules, tables, and inline marks). Anything richer is passed
// through as its plain-Markdown meaning; it is not reverse-engineered back into
// panels, expands, or macros.
export function markdownToAdf(md: string, options: FromMarkdownOptions = {}): AdfNode {
	const ctx: Ctx = { resolveImage: options.resolveImage ?? defaultResolveImage };
	const content = blocks(marked.lexer(md), ctx);
	return { type: "doc", version: 1, content };
}

// ---- block level ----

function blocks(tokens: Token[], ctx: Ctx): AdfNode[] {
	const out: AdfNode[] = [];
	for (const token of tokens) out.push(...block(token, ctx));
	return out;
}

function block(token: Token, ctx: Ctx): AdfNode[] {
	switch (token.type) {
		case "space":
			return [];
		case "heading":
			return [
				{
					type: "heading",
					attrs: { level: clampLevel(token.depth) },
					content: inline(token.tokens ?? [], ctx),
				},
			];
		case "paragraph":
			return paragraph(token.tokens ?? [], ctx);
		case "text":
			// loose text (e.g. a tight list item) behaves like a paragraph
			return paragraph((token as Tokens.Text).tokens ?? [textToken(token.text)], ctx);
		case "list":
			return [list(token as Tokens.List, ctx)];
		case "code":
			return [codeBlock(token as Tokens.Code)];
		case "blockquote":
			return [{ type: "blockquote", content: blocks(token.tokens ?? [], ctx) }];
		case "table":
			return [table(token as Tokens.Table, ctx)];
		case "hr":
			return [{ type: "rule" }];
		case "html":
			// raw HTML has no ADF representation in the clean subset; drop it
			return [];
		default:
			return [];
	}
}

// A paragraph is split around block-level images: text before an image becomes
// its own paragraph, each image becomes a separate media block.
function paragraph(tokens: Token[], ctx: Ctx): AdfNode[] {
	const out: AdfNode[] = [];
	let buffer: Token[] = [];
	const flush = (): void => {
		if (buffer.length === 0) return;
		const nodes = inline(buffer, ctx);
		if (nodes.length > 0) out.push({ type: "paragraph", content: nodes });
		buffer = [];
	};
	for (const token of tokens) {
		if (token.type === "image") {
			flush();
			const image = token as Tokens.Image;
			const node = ctx.resolveImage(image.href, image.text ?? "");
			if (node) out.push(node);
		} else {
			buffer.push(token);
		}
	}
	flush();
	return out;
}

function list(token: Tokens.List, ctx: Ctx): AdfNode {
	if (token.items.length > 0 && token.items.every((i) => i.task)) {
		return {
			type: "taskList",
			attrs: { localId: randomUUID() },
			content: token.items.map((item) => ({
				type: "taskItem",
				attrs: { localId: randomUUID(), state: item.checked ? "DONE" : "TODO" },
				content: inline(itemInline(item), ctx),
			})),
		};
	}
	const node: AdfNode = {
		type: token.ordered ? "orderedList" : "bulletList",
		content: token.items.map((item) => listItem(item, ctx)),
	};
	const start = Number(token.start);
	if (token.ordered && Number.isFinite(start) && start !== 1) node.attrs = { order: start };
	return node;
}

function listItem(item: Tokens.ListItem, ctx: Ctx): AdfNode {
	const children = blocks(
		item.tokens.filter((t) => t.type !== "checkbox"),
		ctx,
	);
	// a list item must contain at least one block
	if (children.length === 0) children.push({ type: "paragraph", content: [] });
	return { type: "listItem", content: children };
}

// Inline tokens for a task item, skipping the leading checkbox token.
function itemInline(item: Tokens.ListItem): Token[] {
	const first = item.tokens.find((t) => t.type === "text");
	if (first && "tokens" in first && first.tokens) return first.tokens;
	return [textToken(item.text)];
}

function codeBlock(token: Tokens.Code): AdfNode {
	const attrs = token.lang ? { language: token.lang } : {};
	const content: AdfNode[] = token.text.length > 0 ? [{ type: "text", text: token.text }] : [];
	return { type: "codeBlock", attrs, content };
}

function table(token: Tokens.Table, ctx: Ctx): AdfNode {
	const header: AdfNode = {
		type: "tableRow",
		content: token.header.map((cell) => tableCell(cell, "tableHeader", ctx)),
	};
	const rows = token.rows.map((row) => ({
		type: "tableRow",
		content: row.map((cell) => tableCell(cell, "tableCell", ctx)),
	}));
	return { type: "table", content: [header, ...rows] };
}

function tableCell(cell: Tokens.TableCell, type: string, ctx: Ctx): AdfNode {
	return { type, content: [{ type: "paragraph", content: inline(cell.tokens, ctx) }] };
}

// ---- inline level ----

function inline(tokens: Token[], ctx: Ctx, marks: AdfMark[] = []): AdfNode[] {
	const out: AdfNode[] = [];
	for (const token of tokens) out.push(...inlineNode(token, ctx, marks));
	return out;
}

function inlineNode(token: Token, ctx: Ctx, marks: AdfMark[]): AdfNode[] {
	switch (token.type) {
		case "text":
		case "escape": {
			const t = token as Tokens.Text;
			if ("tokens" in t && t.tokens?.length) return inline(t.tokens, ctx, marks);
			return textNode(t.text, marks);
		}
		case "strong":
			return inline(
				(token as Tokens.Strong).tokens,
				ctx,
				withMark(marks, { type: "strong" }),
			);
		case "em":
			return inline((token as Tokens.Em).tokens, ctx, withMark(marks, { type: "em" }));
		case "del":
			return inline((token as Tokens.Del).tokens, ctx, withMark(marks, { type: "strike" }));
		case "codespan":
			return textNode((token as Tokens.Codespan).text, withMark(marks, { type: "code" }));
		case "link": {
			const link = token as Tokens.Link;
			return inline(
				link.tokens,
				ctx,
				withMark(marks, { type: "link", attrs: { href: link.href } }),
			);
		}
		case "br":
			return [{ type: "hardBreak" }];
		case "html":
			return textNode((token as Tokens.HTML).text, marks);
		default:
			return "text" in token && token.text ? textNode(token.text, marks) : [];
	}
}

function textNode(text: string, marks: AdfMark[]): AdfNode[] {
	if (text.length === 0) return [];
	const node: AdfNode = { type: "text", text };
	if (marks.length > 0) node.marks = marks;
	return [node];
}

// Append a mark, replacing an existing mark of the same type (marks are unique
// per type in ADF; the innermost link wins).
function withMark(marks: AdfMark[], mark: AdfMark): AdfMark[] {
	return [...marks.filter((m) => m.type !== mark.type), mark];
}

// ---- helpers ----

function defaultResolveImage(href: string, alt: string): AdfNode {
	return {
		type: "mediaSingle",
		attrs: { layout: "center" },
		content: [
			{
				type: "media",
				attrs: alt ? { type: "external", url: href, alt } : { type: "external", url: href },
			},
		],
	};
}

function textToken(text: string): Tokens.Text {
	return { type: "text", raw: text, text, escaped: false } as Tokens.Text;
}

function clampLevel(value: number): number {
	return Math.min(6, Math.max(1, Math.trunc(value) || 1));
}
