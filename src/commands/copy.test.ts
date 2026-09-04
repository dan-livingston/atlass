import { join, resolve } from "node:path";
import { expect, test } from "vite-plus/test";

import type { AtlassianSession } from "#/api/session.ts";
import type { FakeSessionEnv } from "#/test/env.ts";

import { copyPage } from "#/commands/confluence.ts";
import { copyIssue } from "#/commands/jira.ts";
import { fakeJiraEnv } from "#/test/env.ts";

const SITE = "https://acme.atlassian.net";

function doc(text: string, media?: { id: string; alt: string }) {
	return {
		type: "doc",
		version: 1,
		content: [
			{ type: "paragraph", content: [{ type: "text", text }] },
			...(media
				? [
						{
							type: "mediaSingle",
							content: [{ type: "media", attrs: { ...media, type: "file" } }],
						},
					]
				: []),
		],
	};
}

function copyEnv(
	json: Record<string, unknown>,
	binary: Record<string, string>,
): FakeSessionEnv<AtlassianSession> {
	return fakeJiraEnv({
		site: SITE,
		getJson: (path) => {
			if (!(path in json)) throw new Error(`unexpected GET ${path}`);
			return json[path];
		},
		getBinary: (url) => {
			if (!(url in binary)) throw new Error("404 Not Found");
			return new TextEncoder().encode(binary[url]);
		},
	});
}

const dir = resolve("out");

const ISSUE_JSON = {
	"/rest/api/3/issue/PROJ-7?fields=summary,description,issuetype,status,assignee,reporter,priority,labels,created,updated,attachment":
		{
			key: "PROJ-7",
			fields: {
				summary: "Login page broken",
				description: doc("Steps below.", { id: "att-1", alt: "shot.png" }),
				issuetype: { name: "Bug" },
				status: { name: "In Progress", statusCategory: { key: "indeterminate" } },
				assignee: { displayName: "Ada" },
				reporter: { displayName: "Grace" },
				priority: { name: "High" },
				labels: ["auth", "ui"],
				created: "2026-08-01T10:00:00.000+0000",
				updated: "2026-08-02T11:30:00.000+0000",
				attachment: [
					{
						id: "att-1",
						filename: "shot.png",
						content: `${SITE}/rest/api/3/attachment/content/att-1`,
					},
					{
						id: "att-2",
						filename: "shot.png",
						content: `${SITE}/rest/api/3/attachment/content/att-2`,
					},
					{
						id: "att-3",
						filename: "gone.txt",
						content: `${SITE}/rest/api/3/attachment/content/att-3`,
					},
				],
			},
		},
	"/rest/api/3/issue/PROJ-7/comment?maxResults=100&orderBy=created": {
		comments: [
			{
				author: { displayName: "Linus" },
				created: "2026-08-02T09:00:00.000+0000",
				body: doc("Cannot reproduce."),
			},
		],
	},
};

const ISSUE_BINARY = {
	[`${SITE}/rest/api/3/attachment/content/att-1`]: "png-one",
	[`${SITE}/rest/api/3/attachment/content/att-2`]: "png-two",
};

test("copyIssue writes the issue document, its attachments and the wrote line", async () => {
	const env = copyEnv(ISSUE_JSON, ISSUE_BINARY);
	await copyIssue(env, "PROJ-7", dir);

	expect(await env.files.readText(join(dir, "PROJ-7.md"))).toBe(
		[
			"---",
			'key: "PROJ-7"',
			'type: "Bug"',
			'status: "In Progress"',
			'assignee: "Ada"',
			'reporter: "Grace"',
			'priority: "High"',
			"labels:",
			'  - "auth"',
			'  - "ui"',
			'created: "2026-08-01T10:00:00.000+0000"',
			'updated: "2026-08-02T11:30:00.000+0000"',
			`url: "${SITE}/browse/PROJ-7"`,
			"---",
			"",
			"# Login page broken",
			"",
			"Steps below.",
			"",
			"![shot.png](PROJ-7.assets/shot.png)",
			"",
			"## Comments",
			"",
			"### Linus - 2026-08-02 19:00",
			"",
			"Cannot reproduce.",
			"",
			"## Attachments",
			"",
			"- [shot.png](PROJ-7.assets/shot.png)",
			"- [shot.png](PROJ-7.assets/shot-1.png)",
			"",
		].join("\n"),
	);
	expect(env.files.paths()).toEqual([
		join(dir, "PROJ-7.assets", "shot-1.png"),
		join(dir, "PROJ-7.assets", "shot.png"),
		join(dir, "PROJ-7.md"),
	]);
	expect(await env.files.readText(join(dir, "PROJ-7.assets", "shot-1.png"))).toBe("png-two");
	expect(env.term.errors).toEqual([
		"Fetching PROJ-7 ...",
		"  ! could not download gone.txt: 404 Not Found",
	]);
	expect(env.term.written).toEqual([`Wrote ${join(dir, "PROJ-7.md")} (+2 attachments)`]);
});

test("copyIssue with an .md --out writes there and names the assets dir after it", async () => {
	const out = join(dir, "notes", "bug.md");
	const env = copyEnv(ISSUE_JSON, ISSUE_BINARY);
	await copyIssue(env, "PROJ-7", out);

	expect(await env.files.readText(out)).toContain("![shot.png](bug.assets/shot.png)");
	expect(env.files.paths()).toEqual([
		join(dir, "notes", "bug.assets", "shot-1.png"),
		join(dir, "notes", "bug.assets", "shot.png"),
		out,
	]);
});

const PAGE_JSON = {
	"/wiki/api/v2/pages/123?body-format=atlas_doc_format": {
		id: "123",
		title: "Release Notes: v2!",
		spaceId: "S1",
		createdAt: "2026-07-01T08:00:00.000Z",
		version: { number: 4, createdAt: "2026-07-05T08:00:00.000Z", authorId: "u1" },
		body: {
			atlas_doc_format: {
				value: JSON.stringify(doc("What changed.", { id: "f-1", alt: "" })),
			},
		},
		_links: { webui: "/spaces/DEV/pages/123/Release+Notes" },
	},
	"/wiki/api/v2/spaces/S1": { key: "DEV" },
	"/wiki/api/v2/pages/123/attachments?limit=250": {
		results: [
			{ id: "a-1", fileId: "f-1", title: "diagram.png", downloadLink: "/download/a-1" },
		],
	},
	"/wiki/api/v2/pages/123/footer-comments?body-format=atlas_doc_format&limit=250": {
		results: [
			{
				version: { authorId: "u2", createdAt: "2026-07-06T08:00:00.000Z" },
				body: { atlas_doc_format: { value: JSON.stringify(doc("Looks good.")) } },
			},
		],
	},
	"/wiki/rest/api/user?accountId=u1": { displayName: "Ada" },
	"/wiki/rest/api/user?accountId=u2": { displayName: "Linus" },
};

test("copyPage writes the page document named by id and slug", async () => {
	const env = copyEnv(PAGE_JSON, { "/wiki/download/a-1": "png" });
	await copyPage(env, "123", dir);

	const file = join(dir, "123-release-notes-v2.md");
	expect(await env.files.readText(file)).toBe(
		[
			"---",
			'title: "Release Notes: v2!"',
			'id: "123"',
			'space: "DEV"',
			"version: 4",
			'author: "Ada"',
			'created: "2026-07-01T08:00:00.000Z"',
			'updated: "2026-07-05T08:00:00.000Z"',
			`url: "${SITE}/wiki/spaces/DEV/pages/123/Release+Notes"`,
			"---",
			"",
			"# Release Notes: v2!",
			"",
			"What changed.",
			"",
			"![](123-release-notes-v2.assets/diagram.png)",
			"",
			"## Comments",
			"",
			"### Linus - 2026-07-06 18:00",
			"",
			"Looks good.",
			"",
			"## Attachments",
			"",
			"- [diagram.png](123-release-notes-v2.assets/diagram.png)",
			"",
		].join("\n"),
	);
	expect(env.files.paths()).toEqual([
		join(dir, "123-release-notes-v2.assets", "diagram.png"),
		file,
	]);
	expect(env.term.errors).toEqual(["Fetching page 123 ..."]);
	expect(env.term.written).toEqual([`Wrote ${file} (+1 attachment)`]);
});

test("copyPage without attachments writes no assets dir and a bare wrote line", async () => {
	const json = {
		...PAGE_JSON,
		"/wiki/api/v2/pages/123/attachments?limit=250": { results: [] },
	};
	const env = copyEnv(json, {});
	await copyPage(env, "123", dir);

	expect(env.files.paths()).toEqual([join(dir, "123-release-notes-v2.md")]);
	expect(env.term.written.at(-1)).toBe(`Wrote ${join(dir, "123-release-notes-v2.md")}`);
});
