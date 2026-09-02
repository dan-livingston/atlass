import type { Root, RootContent } from "hast";

import kleur from "kleur";
import { common, createLowlight } from "lowlight";

const HEADING = /^#{1,6} /;
const QUOTE = /^(\s*)>( |$)/;
const LIST = /^(\s*)(-|\d+\.) (\[[ x]\] )?/;
const RULE = /^\s*---$/;
const TABLE_ROW = /^\|.*\|$/;
const TABLE_SEPARATOR = /^\|( --- \|)+$/;
const CELL_DIVIDER = /(?<!\\)\|/;
const DETAILS_OPEN = /^(\s*)<details><summary>(.*)<\/summary>$/;
const DETAILS_CLOSE = /^\s*<\/details>$/;
const FENCE_OPEN = /^((?:\s|> |- |\d+\. )*)```(\S*)$/;
const FENCE = "```";
const INLINE =
	/(`[^`]+`)|\[([^\]]+)\]\(((?:[^()]|\([^()]*\))+)\)|\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(?!\*)(.+?)(?<!\*)\*(?!\*)|~~(.+?)~~/g;

type Style = (text: string) => string;

const TOKEN_STYLES: Record<string, Style> = {
	keyword: kleur.magenta,
	built_in: kleur.magenta,
	literal: kleur.magenta,
	string: kleur.green,
	regexp: kleur.green,
	addition: kleur.green,
	number: kleur.yellow,
	symbol: kleur.yellow,
	meta: kleur.yellow,
	attr: kleur.yellow,
	comment: kleur.dim,
	quote: kleur.dim,
	deletion: kleur.dim,
	title: kleur.cyan,
	type: kleur.cyan,
	section: kleur.cyan,
};

const lowlight = createLowlight(common);

export function highlightMarkdown(md: string): string {
	const lines = md.split("\n");
	const out: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";
		const fence = line.match(FENCE_OPEN);
		if (!fence) {
			out.push(highlightLine(line, lines[i + 1]));
			continue;
		}
		const [, prefix = "", lang = ""] = fence;
		const styledPrefix = prefix.replace(/\S+/g, (marker) => kleur.dim(marker));
		out.push(`${styledPrefix}${kleur.dim(`${FENCE}${lang}`)}`);
		const code: string[] = [];
		const prefixed: boolean[] = [];
		let j = i + 1;
		for (; j < lines.length; j++) {
			const raw = lines[j] ?? "";
			const hasPrefix = raw.startsWith(prefix) || raw === prefix.trimEnd();
			const body = raw.startsWith(prefix) ? raw.slice(prefix.length) : hasPrefix ? "" : raw;
			if (body === FENCE) break;
			code.push(body);
			prefixed.push(hasPrefix);
		}
		if (code.length > 0) {
			highlightCode(code.join("\n"), lang)
				.split("\n")
				.forEach((codeLine, k) => {
					const lead = prefixed[k] ? styledPrefix : "";
					out.push(codeLine ? `${lead}${codeLine}` : lead.trimEnd());
				});
		}
		if (j < lines.length) {
			const lead = (lines[j] ?? "").startsWith(prefix) ? styledPrefix : "";
			out.push(`${lead}${kleur.dim(FENCE)}`);
		}
		i = j;
	}
	return out.join("\n");
}

function highlightCode(code: string, lang: string): string {
	if (!lang || !lowlight.registered(lang)) return styleEachLine(code, kleur.yellow);
	return renderTree(lowlight.highlight(lang, code), (text) => text);
}

function renderTree(node: Root | RootContent, style: Style): string {
	if (node.type === "text") return styleEachLine(node.value, style);
	if (node.type !== "root" && node.type !== "element") return "";
	const own = node.type === "element" ? tokenStyle(node.properties["className"]) : undefined;
	const next = own ? (text: string) => style(own(text)) : style;
	return node.children.map((child) => renderTree(child, next)).join("");
}

function tokenStyle(className: unknown): Style | undefined {
	if (!Array.isArray(className)) return undefined;
	for (const name of className) {
		if (typeof name !== "string" || !name.startsWith("hljs-")) continue;
		const style = TOKEN_STYLES[name.slice("hljs-".length)];
		if (style) return style;
	}
	return undefined;
}

function styleEachLine(text: string, style: Style): string {
	return text
		.split("\n")
		.map((line) => (line ? style(line) : line))
		.join("\n");
}

function highlightLine(line: string, nextLine: string | undefined): string {
	const quote = line.match(QUOTE);
	if (quote) {
		const [whole, indent = ""] = quote;
		const rest = line.slice(whole.length);
		const gap = whole.endsWith(" ") ? " " : "";
		return `${indent}${kleur.dim(">")}${gap}${highlightLine(rest, stripPrefix(nextLine, whole))}`;
	}
	const list = line.match(LIST);
	if (list) {
		const [whole, indent = "", marker = "", checkbox] = list;
		const rest = line.slice(whole.length);
		const box = checkbox ? `${kleur.bold(checkbox.trim())} ` : "";
		return `${indent}${kleur.dim(marker)} ${box}${highlightLine(rest, undefined)}`;
	}
	if (HEADING.test(line)) return kleur.bold().cyan(line);
	if (RULE.test(line)) return kleur.dim(line);
	if (TABLE_SEPARATOR.test(line)) return kleur.dim(line);
	if (TABLE_ROW.test(line)) {
		return tableRow(line, nextLine !== undefined && TABLE_SEPARATOR.test(nextLine));
	}
	const details = line.match(DETAILS_OPEN);
	if (details) {
		const [, indent = "", title = ""] = details;
		const open = kleur.dim("<details><summary>");
		return `${indent}${open}${highlightInline(title)}${kleur.dim("</summary>")}`;
	}
	if (DETAILS_CLOSE.test(line)) return kleur.dim(line);
	return highlightInline(line);
}

function stripPrefix(line: string | undefined, prefix: string): string | undefined {
	return line?.startsWith(prefix) ? line.slice(prefix.length) : undefined;
}

function tableRow(line: string, header: boolean): string {
	const cells = line.split(CELL_DIVIDER).slice(1, -1);
	const styled = cells.map((cell) =>
		header ? kleur.bold(highlightInline(cell)) : highlightInline(cell),
	);
	const pipe = kleur.dim("|");
	return `${pipe}${styled.join(pipe)}${pipe}`;
}

function highlightInline(text: string): string {
	return text.replace(
		INLINE,
		(
			match: string,
			code?: string,
			linkText?: string,
			url?: string,
			boldItalic?: string,
			bold?: string,
			italic?: string,
			strike?: string,
		) => {
			if (code !== undefined) return kleur.yellow(code);
			if (linkText !== undefined && url !== undefined) return link(linkText, url);
			if (boldItalic !== undefined) return kleur.bold().italic(match);
			if (bold !== undefined) return kleur.bold(`**${highlightInline(bold)}**`);
			if (italic !== undefined) return kleur.italic(`*${highlightInline(italic)}*`);
			if (strike !== undefined) return kleur.strikethrough(`~~${highlightInline(strike)}~~`);
			return match;
		},
	);
}

function link(text: string, url: string): string {
	const open = kleur.dim("[");
	const middle = kleur.dim("](");
	return `${open}${highlightInline(text)}${middle}${kleur.dim().underline(url)}${kleur.dim(")")}`;
}
