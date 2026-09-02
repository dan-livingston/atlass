import { resolve } from "node:path";
import { expect, test } from "vite-plus/test";

import type { ConfluencePage } from "../api/confluence.ts";
import type { JiraIssue } from "../api/jira.ts";

import { planIssueCopy, planPageCopy, renderCopy } from "./plan.ts";

function issue(overrides: Partial<JiraIssue> = {}): JiraIssue {
	return {
		key: "PROJ-7",
		url: "https://acme.atlassian.net/browse/PROJ-7",
		summary: "Login page broken",
		type: "Bug",
		status: "In Progress",
		statusCategory: "indeterminate",
		assignee: "Ada",
		reporter: "Grace",
		priority: "High",
		labels: ["auth"],
		created: "2026-08-01T10:00:00.000+0000",
		updated: "2026-08-02T11:30:00.000+0000",
		description: null,
		comments: [],
		attachments: [],
		...overrides,
	};
}

test("issue copy lands in the cwd as KEY.md when no --out is given", () => {
	const plan = planIssueCopy(issue(), undefined);
	expect(plan.filePath).toBe(resolve("PROJ-7.md"));
	expect(plan.assetsDir).toBe(resolve("PROJ-7.assets"));
});

test("a directory --out keeps the default name inside it", () => {
	const plan = planIssueCopy(issue(), "notes");
	expect(plan.filePath).toBe(resolve("notes", "PROJ-7.md"));
	expect(plan.assetsDir).toBe(resolve("notes", "PROJ-7.assets"));
});

test("an .md --out is used as is and names the assets dir after it", () => {
	const plan = planIssueCopy(issue(), resolve("notes/bug.md"));
	expect(plan.filePath).toBe(resolve("notes/bug.md"));
	expect(plan.assetsDir).toBe(resolve("notes/bug.assets"));
});

test("attachments are planned into the assets dir, numbering later duplicates", () => {
	const plan = planIssueCopy(
		issue({
			attachments: [
				{ mediaId: "a1", filename: "shot.png", url: "u1" },
				{ mediaId: "a2", filename: "shot.png", url: "u2" },
				{ mediaId: "a3", filename: "shot.png", url: "u3" },
				{ mediaId: "a4", filename: "notes", url: "u4" },
			],
		}),
		"notes",
	);
	expect(plan.downloads).toEqual([
		{
			mediaId: "a1",
			filename: "shot.png",
			url: "u1",
			relativePath: "PROJ-7.assets/shot.png",
			path: resolve("notes/PROJ-7.assets/shot.png"),
		},
		{
			mediaId: "a2",
			filename: "shot.png",
			url: "u2",
			relativePath: "PROJ-7.assets/shot-1.png",
			path: resolve("notes/PROJ-7.assets/shot-1.png"),
		},
		{
			mediaId: "a3",
			filename: "shot.png",
			url: "u3",
			relativePath: "PROJ-7.assets/shot-2.png",
			path: resolve("notes/PROJ-7.assets/shot-2.png"),
		},
		{
			mediaId: "a4",
			filename: "notes",
			url: "u4",
			relativePath: "PROJ-7.assets/notes",
			path: resolve("notes/PROJ-7.assets/notes"),
		},
	]);
});

test("attachment names are reduced to a bare file name", () => {
	const plan = planIssueCopy(
		issue({
			attachments: [
				{ mediaId: "a1", filename: "dir/sub/deep.png", url: "u1" },
				{ mediaId: "a2", filename: "", url: "u2" },
			],
		}),
		undefined,
	);
	expect(plan.downloads.map((d) => d.relativePath)).toEqual([
		"PROJ-7.assets/deep.png",
		"PROJ-7.assets/attachment",
	]);
});

function page(overrides: Partial<ConfluencePage> = {}): ConfluencePage {
	return {
		id: "123",
		title: "Release Notes: v2!",
		spaceKey: "DEV",
		version: 4,
		author: "Ada",
		createdAt: "2026-07-01T08:00:00.000Z",
		updatedAt: "2026-07-05T08:00:00.000Z",
		url: "https://acme.atlassian.net/wiki/spaces/DEV/pages/123/Release+Notes",
		body: null,
		attachments: [],
		comments: [],
		...overrides,
	};
}

test("page copy is named by id and a slug of the title", () => {
	expect(planPageCopy(page(), undefined).filePath).toBe(resolve("123-release-notes-v2.md"));
});

test("a title with no usable characters slugs to page, and long titles are cut at a dash", () => {
	expect(planPageCopy(page({ title: "!!!" }), undefined).filePath).toBe(resolve("123-page.md"));
	const long = "word ".repeat(20).trim();
	expect(planPageCopy(page({ title: long }), undefined).filePath).toBe(
		resolve(`123-${"word-".repeat(11)}word.md`),
	);
});

function paragraphWithImage(text: string, media: { id?: string; alt?: string }) {
	return {
		type: "doc",
		version: 1,
		content: [
			{ type: "paragraph", content: [{ type: "text", text }] },
			{
				type: "mediaSingle",
				content: [{ type: "media", attrs: { ...media, type: "file" } }],
			},
		],
	};
}

test("renderCopy writes issue frontmatter in the copied order with the body and comments", () => {
	const plan = planIssueCopy(
		issue({
			description: paragraphWithImage("Steps below.", { id: "a1", alt: "shot.png" }),
			comments: [
				{
					author: "Linus",
					created: "2026-08-02T09:00:00.000+0000",
					body: paragraphWithImage("See", { alt: "shot.png" }),
				},
			],
			attachments: [{ mediaId: "a1", filename: "shot.png", url: "u1" }],
		}),
		undefined,
	);
	expect(renderCopy(plan, plan.downloads)).toBe(
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
			'created: "2026-08-01T10:00:00.000+0000"',
			'updated: "2026-08-02T11:30:00.000+0000"',
			'url: "https://acme.atlassian.net/browse/PROJ-7"',
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
			"### Linus - 2026-08-02 09:00",
			"",
			"See",
			"",
			"![shot.png](PROJ-7.assets/shot.png)",
			"",
			"## Attachments",
			"",
			"- [shot.png](PROJ-7.assets/shot.png)",
			"",
		].join("\n"),
	);
});

test("renderCopy writes page frontmatter with the id as a string and the version as a number", () => {
	const plan = planPageCopy(page(), undefined);
	expect(renderCopy(plan, [])).toBe(
		[
			"---",
			'title: "Release Notes: v2!"',
			'id: "123"',
			'space: "DEV"',
			"version: 4",
			'author: "Ada"',
			'created: "2026-07-01T08:00:00.000Z"',
			'updated: "2026-07-05T08:00:00.000Z"',
			'url: "https://acme.atlassian.net/wiki/spaces/DEV/pages/123/Release+Notes"',
			"---",
			"",
			"# Release Notes: v2!",
			"",
		].join("\n"),
	);
});

test("renderCopy only links media and lists attachments that actually landed", () => {
	const plan = planPageCopy(
		page({
			body: paragraphWithImage("What changed.", { id: "f-2" }),
			attachments: [
				{ mediaId: "f-1", filename: "a.png", url: "u1" },
				{ mediaId: "f-2", filename: "b.png", url: "u2" },
			],
		}),
		undefined,
	);
	const landed = plan.downloads.filter((d) => d.mediaId === "f-1");
	const text = renderCopy(plan, landed);
	expect(text).toContain("[embedded media: f-2]");
	expect(text).toContain("- [a.png](123-release-notes-v2.assets/a.png)");
	expect(text).not.toContain("b.png");
});
