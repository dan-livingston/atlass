import type { Tokens } from "marked";

import { marked } from "marked";

const COMMENT = /<!--[\s\S]*?-->/g;

export function isOnlyComments(html: string): boolean {
	return html.replace(COMMENT, "").trim().length === 0;
}

export function withoutComments(md: string): string {
	const kept: string[] = [];
	let skipSpace = false;
	for (const token of marked.lexer(md)) {
		if (skipSpace && token.type === "space") continue;
		skipSpace = token.type === "html" && isOnlyComments(token.text);
		if (skipSpace) continue;
		kept.push(token.type === "code" ? token.raw : token.raw.replace(COMMENT, ""));
	}
	return kept.join("").trim();
}

export function htmlWarnings(md: string): string[] {
	let blocks = 0;
	let inline = 0;
	void marked.walkTokens(marked.lexer(md), (token) => {
		if (token.type !== "html" || isOnlyComments(token.text)) return;
		if ((token as Tokens.HTML).block) blocks++;
		else inline++;
	});
	return [
		...(blocks > 0 ? [`${counted(blocks, "HTML block")} will be dropped`] : []),
		...(inline > 0 ? [`${counted(inline, "inline HTML tag")} will be sent as text`] : []),
	];
}

function counted(n: number, noun: string): string {
	return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
