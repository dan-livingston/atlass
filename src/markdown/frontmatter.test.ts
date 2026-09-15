import { expect, test } from "vite-plus/test";

import { rewriteFields, splitFrontmatter } from "#/markdown/frontmatter.ts";
import { BOM } from "#/markdown/text-layout.ts";

const file = [
	"---",
	'title: "Old"',
	'id: "9"',
	"version: 3",
	"custom:   kept as typed",
	"tags:",
	'  - "a"',
	"---",
	"",
	"# Old",
	"",
	"body",
	"",
].join("\n");

test("rewriteFields replaces named keys in place and leaves every other byte alone", () => {
	expect(rewriteFields(file, { version: 4, title: 'New "one"' })).toBe(
		file.replace("version: 3", "version: 4").replace('title: "Old"', 'title: "New \\"one\\""'),
	);
});

test("rewriteFields appends keys the file does not have yet, in the order given", () => {
	const text = rewriteFields(file, { updated: "2026-09-15T01:00:00.000Z", url: "u" });
	expect(text).toContain('  - "a"\nupdated: "2026-09-15T01:00:00.000Z"\nurl: "u"\n---\n\n# Old');
});

test("rewriteFields replaces a list, with its items, by a scalar", () => {
	const text = rewriteFields(file, { tags: "none" });
	expect(splitFrontmatter(text)?.fields["tags"]).toBe("none");
	expect(text).not.toContain('  - "a"');
});

test("rewriteFields keeps CRLF line endings and a BOM", () => {
	const crlf = `${BOM}${file.replace(/\n/g, "\r\n")}`;
	expect(rewriteFields(crlf, { version: 4 })).toBe(
		`${BOM}${file.replace("version: 3", "version: 4").replace(/\n/g, "\r\n")}`,
	);
});

test("rewriteFields gives a file without frontmatter a new block", () => {
	expect(rewriteFields("# Title\n\nbody\n", { id: "7", version: 1 })).toBe(
		'---\nid: "7"\nversion: 1\n---\n\n# Title\n\nbody\n',
	);
});
