import { expect, test } from "vite-plus/test";

import { markdownToAdf } from "./from-markdown.ts";
import { adfToMarkdown } from "./to-markdown.ts";

test("doc wrapper carries version 1", () => {
	const doc = markdownToAdf("hello");
	expect(doc.type).toBe("doc");
	expect(doc.version).toBe(1);
});

test("paragraph", () => {
	expect(markdownToAdf("hello world").content).toEqual([
		{ type: "paragraph", content: [{ type: "text", text: "hello world" }] },
	]);
});

test("headings", () => {
	const content = markdownToAdf("# Title\n\n### Sub").content;
	expect(content).toEqual([
		{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] },
		{ type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Sub" }] },
	]);
});

test("inline marks", () => {
	const para = markdownToAdf("**a** *b* `c` ~~d~~").content![0];
	expect(para.content).toEqual([
		{ type: "text", text: "a", marks: [{ type: "strong" }] },
		{ type: "text", text: " " },
		{ type: "text", text: "b", marks: [{ type: "em" }] },
		{ type: "text", text: " " },
		{ type: "text", text: "c", marks: [{ type: "code" }] },
		{ type: "text", text: " " },
		{ type: "text", text: "d", marks: [{ type: "strike" }] },
	]);
});

test("link mark", () => {
	const para = markdownToAdf("[label](https://x.test)").content![0];
	expect(para.content).toEqual([
		{
			type: "text",
			text: "label",
			marks: [{ type: "link", attrs: { href: "https://x.test" } }],
		},
	]);
});

test("nested marks combine", () => {
	const para = markdownToAdf("**_bold em_**").content![0];
	expect(para.content).toEqual([
		{ type: "text", text: "bold em", marks: [{ type: "strong" }, { type: "em" }] },
	]);
});

test("bullet and ordered lists", () => {
	const bullet = markdownToAdf("- a\n- b").content![0];
	expect(bullet.type).toBe("bulletList");
	expect(bullet.content).toHaveLength(2);
	expect(bullet.content?.[0]).toEqual({
		type: "listItem",
		content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }],
	});

	const ordered = markdownToAdf("3. a\n4. b").content![0];
	expect(ordered.type).toBe("orderedList");
	expect(ordered.attrs).toEqual({ order: 3 });
});

test("nested list", () => {
	const list = markdownToAdf("- a\n    - b").content![0];
	const item = list.content![0];
	expect(item?.content?.[1]?.type).toBe("bulletList");
	expect(item?.content?.[1]?.content?.[0]?.content?.[0]).toEqual({
		type: "paragraph",
		content: [{ type: "text", text: "b" }],
	});
});

test("task list", () => {
	const list = markdownToAdf("- [ ] todo\n- [x] done").content![0];
	expect(list.type).toBe("taskList");
	expect(list.content?.[0]?.type).toBe("taskItem");
	expect(list.content?.[0]?.attrs?.["state"]).toBe("TODO");
	expect(list.content?.[1]?.attrs?.["state"]).toBe("DONE");
	expect(list.content?.[1]?.content).toEqual([{ type: "text", text: "done" }]);
});

test("code block with language", () => {
	const block = markdownToAdf("```js\ncode();\n```").content![0];
	expect(block).toEqual({
		type: "codeBlock",
		attrs: { language: "js" },
		content: [{ type: "text", text: "code();" }],
	});
});

test("blockquote", () => {
	const quote = markdownToAdf("> hi").content![0];
	expect(quote).toEqual({
		type: "blockquote",
		content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }],
	});
});

test("rule", () => {
	expect(markdownToAdf("---").content?.[0]).toEqual({ type: "rule" });
});

test("table", () => {
	const table = markdownToAdf("| a | b |\n| --- | --- |\n| 1 | 2 |").content![0];
	expect(table.type).toBe("table");
	expect(table.content?.[0]?.content?.[0]).toEqual({
		type: "tableHeader",
		content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }],
	});
	expect(table.content?.[1]?.content?.[1]).toEqual({
		type: "tableCell",
		content: [{ type: "paragraph", content: [{ type: "text", text: "2" }] }],
	});
});

test("hard break", () => {
	const para = markdownToAdf("line1  \nline2").content![0];
	expect(para.content).toEqual([
		{ type: "text", text: "line1" },
		{ type: "hardBreak" },
		{ type: "text", text: "line2" },
	]);
});

test("image becomes its own media block via resolver", () => {
	const media = {
		type: "mediaSingle",
		content: [{ type: "media", attrs: { type: "file", id: "F1" } }],
	};
	const content = markdownToAdf("before ![alt](img.png) after", {
		resolveImage: (href, alt) => {
			expect(href).toBe("img.png");
			expect(alt).toBe("alt");
			return media;
		},
	}).content;
	expect(content).toEqual([
		{ type: "paragraph", content: [{ type: "text", text: "before " }] },
		media,
		{ type: "paragraph", content: [{ type: "text", text: " after" }] },
	]);
});

test("html blocks are dropped", () => {
	expect(markdownToAdf("<div>raw</div>").content).toEqual([]);
});

// round-trips: ADF -> Markdown -> ADF returns to the same clean-subset shape
test("round-trip through to-markdown for the clean subset", () => {
	const md = [
		"# Title",
		"",
		"para with **bold**, *em*, `code`, ~~strike~~ and a [link](https://x.test).",
		"",
		"- one",
		"- two",
		"  - nested",
		"",
		"1. first",
		"2. second",
		"",
		"- [ ] todo",
		"- [x] done",
		"",
		"```ts",
		"const x = 1;",
		"```",
		"",
		"> quoted",
		"",
		"| h1 | h2 |",
		"| --- | --- |",
		"| a | b |",
		"",
		"---",
	].join("\n");

	const adf = markdownToAdf(md);
	// converting the produced ADF back to Markdown reproduces the source
	expect(adfToMarkdown(adf).trim()).toBe(md.trim());
});
