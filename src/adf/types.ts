// Minimal shapes for the parts of the Atlassian Document Format we walk.
// ADF is an open tree, so nodes are loosely typed and handled by `type`.

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
	// only set on the top-level "doc" node (atlas_doc_format requires version 1)
	version?: number;
}

export interface MediaAttrs {
	id?: string;
	type?: string;
	collection?: string;
	alt?: string;
	width?: number;
	height?: number;
}
