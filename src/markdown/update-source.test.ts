import { expect, test } from "vite-plus/test";

import { findLossyNodes, formatLossy, parseUpdateSource } from "./update-source.ts";

const file = [
	"---",
	'title: "My Page"',
	'id: "123456"',
	'space: "DEV"',
	"version: 7",
	'url: "https://acme.atlassian.net/wiki/x"',
	"---",
	"",
	"# My Page",
	"",
	"Body paragraph.",
	"",
	"- a",
	"- b",
	"",
	"## Comments",
	"",
	"### Someone - 2025-01-01 00:00",
	"",
	"a comment",
	"",
	"## Attachments",
	"",
	"- [f.png](123456-my-page.assets/f.png)",
	"",
].join("\n");

test("parses identity from frontmatter", () => {
	const src = parseUpdateSource(file);
	expect(src.id).toBe("123456");
	expect(src.version).toBe(7);
	expect(src.frontTitle).toBe("My Page");
	expect(src.bodyTitle).toBe("My Page");
});

test("body excludes frontmatter, H1, comments, and attachments", () => {
	const src = parseUpdateSource(file);
	expect(src.body).toBe("Body paragraph.\n\n- a\n- b");
});

test("captures an edited H1 as the body title", () => {
	const src = parseUpdateSource(file.replace("# My Page", "# Renamed Page"));
	expect(src.bodyTitle).toBe("Renamed Page");
	expect(src.frontTitle).toBe("My Page");
});

test("body with no trailing sections runs to end of file", () => {
	const min = ["---", 'id: "9"', "version: 1", "---", "", "# T", "", "just body"].join("\n");
	expect(parseUpdateSource(min).body).toBe("just body");
});

test("throws without frontmatter", () => {
	expect(() => parseUpdateSource("# Title\n\nbody")).toThrow(/frontmatter/);
});

test("throws without an id", () => {
	const noId = ["---", "version: 1", "---", "", "# T", "", "body"].join("\n");
	expect(() => parseUpdateSource(noId)).toThrow(/id/);
});

test("throws without a numeric version", () => {
	const noVer = ["---", 'id: "9"', "---", "", "# T", "", "body"].join("\n");
	expect(() => parseUpdateSource(noVer)).toThrow(/version/);
});

test("finds and labels lossy nodes", () => {
	const body = {
		type: "doc",
		content: [
			{ type: "panel", content: [{ type: "paragraph" }] },
			{ type: "extension" },
			{ type: "bodiedExtension", content: [{ type: "nestedExpand" }] },
		],
	};
	const counts = findLossyNodes(body);
	expect(counts.get("panel")).toBe(1);
	expect(counts.get("macro")).toBe(2);
	expect(counts.get("expand")).toBe(1);
	expect(formatLossy(counts)).toBe("1 panel, 2 macros, 1 expand");
});

test("no lossy nodes yields an empty map", () => {
	const body = { type: "doc", content: [{ type: "paragraph" }] };
	expect(findLossyNodes(body).size).toBe(0);
});
