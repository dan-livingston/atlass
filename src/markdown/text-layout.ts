export const BOM = String.fromCharCode(0xfeff);

interface TextLayout {
	bom: boolean;
	crlf: boolean;
}

function layoutOf(raw: string): TextLayout {
	return { bom: raw.startsWith(BOM), crlf: /\r?\n/.exec(raw)?.[0] === "\r\n" };
}

export function normalized(raw: string): string {
	const text = raw.startsWith(BOM) ? raw.slice(BOM.length) : raw;
	return text.replace(/\r\n/g, "\n");
}

export function editKeepingLayout(raw: string, edit: (text: string) => string): string {
	return withLayout(edit(normalized(raw)), layoutOf(raw));
}

function withLayout(text: string, layout: TextLayout): string {
	const lines = layout.crlf ? text.replace(/\n/g, "\r\n") : text;
	return layout.bom ? `${BOM}${lines}` : lines;
}
