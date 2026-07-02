import { expect, test } from "vite-plus/test";

import type { AdfNode } from "./types.ts";

import { adfToMarkdown } from "./to-markdown.ts";

function doc(...content: AdfNode[]): AdfNode {
	return { type: "doc", content };
}

function para(...content: AdfNode[]): AdfNode {
	return { type: "paragraph", content };
}

function text(value: string, marks?: AdfNode["marks"]): AdfNode {
	return marks ? { type: "text", text: value, marks } : { type: "text", text: value };
}

test("paragraph", () => {
	expect(adfToMarkdown(doc(para(text("hello world"))))).toBe("hello world");
});

test("headings clamp to 1-6", () => {
	const d = doc(
		{ type: "heading", attrs: { level: 1 }, content: [text("Title")] },
		{ type: "heading", attrs: { level: 3 }, content: [text("Sub")] },
	);
	expect(adfToMarkdown(d)).toBe("# Title\n\n### Sub");
});

test("inline marks", () => {
	const d = doc(
		para(
			text("a", [{ type: "strong" }]),
			text(" "),
			text("b", [{ type: "em" }]),
			text(" "),
			text("c", [{ type: "code" }]),
			text(" "),
			text("d", [{ type: "strike" }]),
		),
	);
	expect(adfToMarkdown(d)).toBe("**a** *b* `c` ~~d~~");
});

test("link mark wraps other marks", () => {
	const d = doc(
		para(
			text("click", [{ type: "strong" }, { type: "link", attrs: { href: "https://x.dev" } }]),
		),
	);
	expect(adfToMarkdown(d)).toBe("[**click**](https://x.dev)");
});

test("bullet list", () => {
	const d = doc({
		type: "bulletList",
		content: [
			{ type: "listItem", content: [para(text("one"))] },
			{ type: "listItem", content: [para(text("two"))] },
		],
	});
	expect(adfToMarkdown(d)).toBe("- one\n- two");
});

test("ordered list honors start", () => {
	const d = doc({
		type: "orderedList",
		attrs: { order: 3 },
		content: [
			{ type: "listItem", content: [para(text("a"))] },
			{ type: "listItem", content: [para(text("b"))] },
		],
	});
	expect(adfToMarkdown(d)).toBe("3. a\n4. b");
});

test("nested list indents", () => {
	const d = doc({
		type: "bulletList",
		content: [
			{
				type: "listItem",
				content: [
					para(text("parent")),
					{
						type: "bulletList",
						content: [{ type: "listItem", content: [para(text("child"))] }],
					},
				],
			},
		],
	});
	expect(adfToMarkdown(d)).toBe("- parent\n  - child");
});

test("task list", () => {
	const d = doc({
		type: "taskList",
		content: [
			{ type: "taskItem", attrs: { state: "DONE" }, content: [text("done")] },
			{ type: "taskItem", attrs: { state: "TODO" }, content: [text("todo")] },
		],
	});
	expect(adfToMarkdown(d)).toBe("- [x] done\n- [ ] todo");
});

test("code block with language", () => {
	const d = doc({
		type: "codeBlock",
		attrs: { language: "ts" },
		content: [text("const x = 1;")],
	});
	expect(adfToMarkdown(d)).toBe("```ts\nconst x = 1;\n```");
});

test("blockquote", () => {
	const d = doc({ type: "blockquote", content: [para(text("quoted"))] });
	expect(adfToMarkdown(d)).toBe("> quoted");
});

test("panel becomes labeled blockquote", () => {
	const d = doc({
		type: "panel",
		attrs: { panelType: "warning" },
		content: [para(text("careful"))],
	});
	expect(adfToMarkdown(d)).toBe("> **Warning**\n>\n> careful");
});

test("rule", () => {
	expect(adfToMarkdown(doc({ type: "rule" }))).toBe("---");
});

test("table with header row", () => {
	const cell = (value: string, type = "tableCell"): AdfNode => ({
		type,
		content: [para(text(value))],
	});
	const d = doc({
		type: "table",
		content: [
			{ type: "tableRow", content: [cell("H1", "tableHeader"), cell("H2", "tableHeader")] },
			{ type: "tableRow", content: [cell("a"), cell("b")] },
		],
	});
	expect(adfToMarkdown(d)).toBe("| H1 | H2 |\n| --- | --- |\n| a | b |");
});

test("mention, emoji, date, status", () => {
	const d = doc(
		para(
			{ type: "mention", attrs: { text: "@Dan" } },
			text(" "),
			{ type: "emoji", attrs: { shortName: ":smile:", text: "😄" } },
			text(" "),
			{ type: "date", attrs: { timestamp: "1751328000000" } },
			text(" "),
			{ type: "status", attrs: { text: "In Progress" } },
		),
	);
	expect(adfToMarkdown(d)).toBe("@Dan 😄 2025-07-01 `[In Progress]`");
});

test("inline card", () => {
	const d = doc(para({ type: "inlineCard", attrs: { url: "https://ex.dev/x" } }));
	expect(adfToMarkdown(d)).toBe("[https://ex.dev/x](https://ex.dev/x)");
});

test("hard break", () => {
	const d = doc(para(text("a"), { type: "hardBreak" }, text("b")));
	expect(adfToMarkdown(d)).toBe("a  \nb");
});

test("media resolves to image link", () => {
	const d = doc({
		type: "mediaSingle",
		content: [{ type: "media", attrs: { id: "abc", alt: "shot.png" } }],
	});
	const md = adfToMarkdown(d, { resolveMedia: (m) => `x.assets/${m.alt}` });
	expect(md).toBe("![shot.png](x.assets/shot.png)");
});

test("unresolved media becomes placeholder", () => {
	const d = doc({
		type: "mediaSingle",
		content: [{ type: "media", attrs: { id: "abc", alt: "shot.png" } }],
	});
	expect(adfToMarkdown(d)).toBe("[embedded media: shot.png]");
});

test("unknown node falls back to children", () => {
	const d = doc({ type: "weirdWrapper", content: [para(text("still here"))] });
	expect(adfToMarkdown(d)).toBe("still here");
});

test("empty doc", () => {
	expect(adfToMarkdown(doc())).toBe("");
	expect(adfToMarkdown(null)).toBe("");
});
