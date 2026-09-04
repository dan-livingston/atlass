import { expect, test } from "vite-plus/test";

import type { CopiedDoc, CopiedSource } from "#/markdown/copied-document.ts";

import { parse, parseIssueSource, parsePageSource, render } from "#/markdown/copied-document.ts";

function doc(over: Partial<CopiedDoc> = {}): CopiedDoc {
	return {
		fields: { id: "123456", version: 7 },
		title: "My Page",
		body: "Body paragraph.",
		comments: [],
		attachments: [],
		...over,
	};
}

function source(d: CopiedDoc): CopiedSource {
	return { fields: d.fields, title: d.title, body: d.body };
}

const page = doc({
	fields: {
		title: "My Page",
		id: "123456",
		space: "DEV",
		version: 7,
		url: "https://acme.atlassian.net/wiki/x",
	},
	body: "Body paragraph.\n\n- a\n- b",
	comments: [{ author: "Someone", created: "2025-01-01T00:00:00.000Z", body: "a comment" }],
	attachments: [{ filename: "f.png", relativePath: "123456-my-page.assets/f.png" }],
});

const pageFile = [
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
	"### Someone - 2025-01-01 10:00",
	"",
	"a comment",
	"",
	"## Attachments",
	"",
	"- [f.png](123456-my-page.assets/f.png)",
	"",
].join("\n");

test("render writes frontmatter, H1, body, comments, and attachments in order", () => {
	expect(render(page)).toBe(pageFile);
});

test("render quotes strings, lists arrays, and leaves numbers bare", () => {
	const text = render(doc({ fields: { key: "PROJ-1", labels: ["a", "b"], version: 3 } }));
	expect(
		text.startsWith('---\nkey: "PROJ-1"\nlabels:\n  - "a"\n  - "b"\nversion: 3\n---\n'),
	).toBe(true);
});

test("render escapes quotes and backslashes", () => {
	expect(render(doc({ fields: { title: 'a "quoted" \\ title' } }))).toContain(
		'title: "a \\"quoted\\" \\\\ title"',
	);
});

test("render writes an empty list inline", () => {
	expect(render(doc({ fields: { labels: [] } }))).toContain("labels: []");
});

test("render drops empty sections and ends with a newline", () => {
	expect(render(doc({ body: "" }))).toBe('---\nid: "123456"\nversion: 7\n---\n\n# My Page\n');
});

test("render names unknown comment authors and omits missing dates and bodies", () => {
	const text = render(doc({ comments: [{ author: "", created: "", body: "" }] }));
	expect(text.endsWith("## Comments\n\n### Unknown\n")).toBe(true);
});

test("parse recovers fields, title, and the body window", () => {
	expect(parse(pageFile)).toEqual(source(page));
});

test("parse reads lists, numbers, quoted strings, and bare strings", () => {
	const text = [
		"---",
		"labels:",
		'  - "a"',
		'  - "b"',
		"empty: []",
		"n: 42",
		's: "7"',
		"bare: x y",
		"---",
		"",
	].join("\n");
	expect(parse(text).fields).toEqual({
		labels: ["a", "b"],
		empty: [],
		n: 42,
		s: "7",
		bare: "x y",
	});
});

test("parse falls back to the frontmatter title when the H1 is missing", () => {
	const text = ["---", 'title: "From Frontmatter"', "---", "", "just body"].join("\n");
	expect(parse(text)).toEqual({
		fields: { title: "From Frontmatter" },
		title: "From Frontmatter",
		body: "just body",
	});
});

test("parse stops the body at the first trailing section, even one written by the user", () => {
	const text = [
		"---",
		'id: "9"',
		"---",
		"",
		"# T",
		"",
		"body",
		"",
		"## Comments",
		"",
		"mine",
	].join("\n");
	expect(parse(text).body).toBe("body");
});

test("parse throws without frontmatter", () => {
	expect(() => parse("# Title\n\nbody")).toThrow(/frontmatter/);
});

const roundTrips: [string, CopiedDoc][] = [
	["page with comments and attachments", page],
	[
		"issue with labels and escaping",
		doc({
			fields: {
				key: "PROJ-123",
				type: "Bug",
				status: 'Say "hi" \\ there',
				labels: ["regression", 'needs "review"'],
				priority: "",
				updated: "2025-07-01T10:30:00.000+0000",
			},
			title: "Login button does nothing",
			body: "Steps:\n\n1. Open\n2. Click\n\n```\ncode\n```",
			comments: [{ author: "Dan", created: "2025-07-01T10:30:00.000Z", body: "hi" }],
		}),
	],
	["empty body and empty list", doc({ fields: { key: "PROJ-1", labels: [] }, body: "" })],
	["numeric-looking string stays a string", doc({ fields: { id: "123", version: 7 } })],
	[
		"body containing a heading that looks like a trailing section",
		doc({ body: "Intro\n\n## Comments on design\n\nstill body" }),
	],
];

for (const [name, d] of roundTrips) {
	test(`round trip: ${name}`, () => {
		expect(parse(render(d))).toEqual(source(d));
	});
}

test("parseIssueSource reads the key and copy timestamp", () => {
	const src = parseIssueSource(
		render(
			doc({
				fields: { key: "PROJ-123", updated: "2025-07-01T10:30:00.000+0000" },
				title: "Login button does nothing",
				body: "Steps to reproduce.",
			}),
		),
	);
	expect(src.key).toBe("PROJ-123");
	expect(src.updatedAtCopy).toBe("2025-07-01T10:30:00.000+0000");
	expect(src.title).toBe("Login button does nothing");
	expect(src.body).toBe("Steps to reproduce.");
});

test("parseIssueSource defaults the copy timestamp to empty when absent", () => {
	expect(parseIssueSource(render(doc({ fields: { key: "PROJ-1" } }))).updatedAtCopy).toBe("");
});

test("parseIssueSource throws without a key", () => {
	expect(() => parseIssueSource(render(doc({ fields: { updated: "x" } })))).toThrow(/key/);
});

test("parsePageSource reads the id and version", () => {
	const src = parsePageSource(pageFile);
	expect(src.id).toBe("123456");
	expect(src.version).toBe(7);
	expect(src.title).toBe("My Page");
});

test("parsePageSource accepts a quoted version from a hand-edited file", () => {
	const text = ["---", 'id: "9"', 'version: "3"', "---", "", "# T"].join("\n");
	expect(parsePageSource(text).version).toBe(3);
});

test("parsePageSource throws without an id or a numeric version", () => {
	expect(() => parsePageSource(render(doc({ fields: { version: 1 } })))).toThrow(/id/);
	expect(() => parsePageSource(render(doc({ fields: { id: "9" } })))).toThrow(/version/);
});
