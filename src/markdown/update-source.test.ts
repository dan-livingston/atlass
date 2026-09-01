import { expect, test } from "vite-plus/test";

import { parseJiraUpdateSource, parsePageUpdateSource } from "./update-source.ts";

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
	const src = parsePageUpdateSource(file);
	expect(src.id).toBe("123456");
	expect(src.version).toBe(7);
	expect(src.h1Title).toBe("My Page");
});

test("body excludes frontmatter, H1, comments, and attachments", () => {
	const src = parsePageUpdateSource(file);
	expect(src.body).toBe("Body paragraph.\n\n- a\n- b");
});

test("captures an edited H1 as the body title", () => {
	const src = parsePageUpdateSource(file.replace("# My Page", "# Renamed Page"));
	expect(src.h1Title).toBe("Renamed Page");
});

test("body with no trailing sections runs to end of file", () => {
	const min = ["---", 'id: "9"', "version: 1", "---", "", "# T", "", "just body"].join("\n");
	expect(parsePageUpdateSource(min).body).toBe("just body");
});

test("throws without frontmatter", () => {
	expect(() => parsePageUpdateSource("# Title\n\nbody")).toThrow(/frontmatter/);
});

test("throws without an id", () => {
	const noId = ["---", "version: 1", "---", "", "# T", "", "body"].join("\n");
	expect(() => parsePageUpdateSource(noId)).toThrow(/id/);
});

test("throws without a numeric version", () => {
	const noVer = ["---", 'id: "9"', "---", "", "# T", "", "body"].join("\n");
	expect(() => parsePageUpdateSource(noVer)).toThrow(/version/);
});

const jiraFile = [
	"---",
	'key: "PROJ-123"',
	'type: "Bug"',
	'status: "Open"',
	'updated: "2025-07-01T10:30:00.000+0000"',
	"labels:",
	'  - "regression"',
	'url: "https://acme.atlassian.net/browse/PROJ-123"',
	"---",
	"",
	"# Login button does nothing",
	"",
	"Steps to reproduce.",
	"",
	"## Comments",
	"",
	"### Someone - 2025-01-01 00:00",
	"",
	"a comment",
].join("\n");

test("parses issue key and updated timestamp from frontmatter", () => {
	const src = parseJiraUpdateSource(jiraFile);
	expect(src.key).toBe("PROJ-123");
	expect(src.updatedAtCopy).toBe("2025-07-01T10:30:00.000+0000");
	expect(src.h1Title).toBe("Login button does nothing");
	expect(src.body).toBe("Steps to reproduce.");
});

test("jira update defaults updatedAtCopy to empty when absent", () => {
	const min = ["---", 'key: "PROJ-1"', "---", "", "# T", "", "body"].join("\n");
	expect(parseJiraUpdateSource(min).updatedAtCopy).toBe("");
});

test("jira update throws without a key", () => {
	const noKey = ["---", 'updated: "x"', "---", "", "# T", "", "body"].join("\n");
	expect(() => parseJiraUpdateSource(noKey)).toThrow(/key/);
});

test("jira update throws without frontmatter", () => {
	expect(() => parseJiraUpdateSource("# T\n\nbody")).toThrow(/frontmatter/);
});
