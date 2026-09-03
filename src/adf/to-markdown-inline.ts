import type { Ctx } from "#/adf/to-markdown.ts";
import type { AdfMark, AdfNode, MediaAttrs } from "#/adf/types.ts";

export function renderMedia(node: AdfNode, ctx: Ctx): string {
	const attrs = (node.attrs ?? {}) as MediaAttrs;
	const alt = attrs.alt ?? "";
	const resolved = ctx.resolveMedia?.(attrs);
	if (resolved) return `![${alt}](${resolved})`;
	const label = alt || attrs.id || "media";
	return `[embedded media: ${label}]`;
}

export function renderInline(nodes: AdfNode[], ctx: Ctx): string {
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
