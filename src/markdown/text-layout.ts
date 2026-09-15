const BOM = "﻿";

export interface TextLayout {
	bom: boolean;
	crlf: boolean;
}

export function layoutOf(raw: string): TextLayout {
	return { bom: raw.startsWith(BOM), crlf: /\r?\n/.exec(raw)?.[0] === "\r\n" };
}

export function normalized(raw: string): string {
	return raw.replace(/^﻿/, "").replace(/\r\n/g, "\n");
}

export function withLayout(text: string, layout: TextLayout): string {
	const lines = layout.crlf ? text.replace(/\n/g, "\r\n") : text;
	return layout.bom ? `${BOM}${lines}` : lines;
}
