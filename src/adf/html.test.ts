import { expect, test } from "vite-plus/test";

import { htmlWarnings, isOnlyComments } from "#/adf/html.ts";

test("isOnlyComments is true for comments and whitespace, false for any tag", () => {
	expect(isOnlyComments("<!-- note -->")).toBe(true);
	expect(isOnlyComments("<!-- one -->\n<!-- two\nlines -->\n")).toBe(true);
	expect(isOnlyComments("<!-- note --><br>")).toBe(false);
	expect(isOnlyComments("<div>x</div>")).toBe(false);
});

test("htmlWarnings counts dropped blocks and literal inline tags, ignoring comments", () => {
	const md = [
		"Intro <!-- aside --> with <b>bold</b>.",
		"",
		"<!-- a block comment -->",
		"",
		"<div>gone</div>",
		"",
		"| a | b |",
		"|---|---|",
		"| x<br>y | z |",
	].join("\n");
	expect(htmlWarnings(md)).toEqual([
		"1 HTML block will be dropped",
		"3 inline HTML tags will be sent as text",
	]);
});

test("htmlWarnings is empty for plain Markdown, comments, and HTML inside code", () => {
	expect(htmlWarnings("Plain text.\n\n<!-- note -->\n\n```\n<div>code</div>\n```")).toEqual([]);
});
