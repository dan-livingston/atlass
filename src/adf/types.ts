export interface AdfMark {
	type: string;
	attrs?: Record<string, unknown>;
}

export interface AdfNode {
	type: string;
	attrs?: Record<string, unknown>;
	content?: AdfNode[];
	marks?: AdfMark[];
	text?: string;
}

export interface AdfDoc extends AdfNode {
	type: "doc";
	version: 1;
}

export interface MediaAttrs {
	id?: string;
	type?: string;
	collection?: string;
	alt?: string;
	width?: number;
	height?: number;
}
