import type { Token, Tokens } from "marked";

import { marked } from "marked";
import { randomUUID } from "node:crypto";

import type { AdfDoc, AdfMark, AdfNode } from "./types.ts";

export interface FromMarkdownOptions {
	resolveImage?: (href: string, alt: string) => AdfNode | undefined;
}

export type MediaSource =
	| { type: "external"; url: string }
	| { type: "file"; id: string; collection: string };

export function mediaNode(source: MediaSource, alt: string): AdfNode {
	const attrs: Record<string, unknown> = { ...source };
	if (alt) attrs["alt"] = alt;
	return {
		type: "mediaSingle",
		attrs: { layout: "center" },
		content: [{ type: "media", attrs }],
	};
}

export function imageHrefs(md: string): string[] {
	const hrefs = new Set<string>();
	void marked.walkTokens(marked.lexer(md), (token) => {
		if (token.type === "image") hrefs.add((token as Tokens.Image).href);
	});
	return [...hrefs];
}

interface Ctx {
	resolveImage: (href: string, alt: string) => AdfNode | undefined;
}

export function markdownToAdf(md: string, options: FromMarkdownOptions = {}): AdfDoc {
	const ctx: Ctx = { resolveImage: options.resolveImage ?? externalMedia };
	const content = blocks(marked.lexer(md), ctx);
	return { type: "doc", version: 1, content };
}

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
			return paragraphsSplitAtImages(token.tokens ?? [], ctx);
		case "text":
			return paragraphsSplitAtImages(
				(token as Tokens.Text).tokens ?? [textToken(token.text)],
				ctx,
			);
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
		default:
			return [];
	}
}

function paragraphsSplitAtImages(tokens: Token[], ctx: Ctx): AdfNode[] {
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
				content: inline(taskItemInline(item), ctx),
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
	const content = children.length > 0 ? children : [emptyParagraph()];
	return { type: "listItem", content };
}

function emptyParagraph(): AdfNode {
	return { type: "paragraph", content: [] };
}

function taskItemInline(item: Tokens.ListItem): Token[] {
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
				withUniqueMark(marks, { type: "strong" }),
			);
		case "em":
			return inline((token as Tokens.Em).tokens, ctx, withUniqueMark(marks, { type: "em" }));
		case "del":
			return inline(
				(token as Tokens.Del).tokens,
				ctx,
				withUniqueMark(marks, { type: "strike" }),
			);
		case "codespan":
			return textNode(
				(token as Tokens.Codespan).text,
				withUniqueMark(marks, { type: "code" }),
			);
		case "link": {
			const link = token as Tokens.Link;
			return inline(
				link.tokens,
				ctx,
				withUniqueMark(marks, { type: "link", attrs: { href: link.href } }),
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

function withUniqueMark(marks: AdfMark[], mark: AdfMark): AdfMark[] {
	return [...marks.filter((m) => m.type !== mark.type), mark];
}

export function externalMedia(href: string, alt: string): AdfNode {
	return mediaNode({ type: "external", url: href }, alt);
}

function textToken(text: string): Tokens.Text {
	return { type: "text", raw: text, text, escaped: false } as Tokens.Text;
}

function clampLevel(value: number): number {
	return Math.min(6, Math.max(1, Math.trunc(value) || 1));
}
