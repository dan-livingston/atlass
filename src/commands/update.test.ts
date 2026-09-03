import { join, resolve } from "node:path";
import { expect, test } from "vite-plus/test";

import type { FileSeed } from "#/files/memory.ts";

import { confluenceUpdate } from "#/commands/confluence.ts";
import { jiraUpdate } from "#/commands/jira.ts";
import { fakeJiraEnv, routed } from "#/test/env.ts";

const dir = resolve("work");

const ISSUE_PATH =
	"/rest/api/3/issue/PROJ-7?fields=summary,description,issuetype,status,assignee,reporter,priority,labels,created,updated,attachment";

function issueJson(updated: string) {
	return {
		[ISSUE_PATH]: {
			key: "PROJ-7",
			fields: {
				summary: "Login broken",
				updated,
				issuetype: { name: "Bug" },
				status: { name: "To Do", statusCategory: { key: "new" } },
				labels: [],
				attachment: [],
			},
		},
		"/rest/api/3/issue/PROJ-7/comment?maxResults=100&orderBy=created": { comments: [] },
	};
}

const ISSUE_FILE = join(dir, "PROJ-7.md");

function issueSeed(updated: string, body: string): FileSeed {
	return {
		[ISSUE_FILE]: [
			"---",
			'key: "PROJ-7"',
			`updated: "${updated}"`,
			"---",
			"",
			"# Login broken",
			"",
			body,
			"",
		].join("\n"),
	};
}

const COPIED_AT = "2026-09-01T09:00:00.000Z";

test("jira update: an unchanged issue is pushed and the result reported", async () => {
	const pushed: unknown[] = [];
	const env = fakeJiraEnv(
		{
			getJson: routed(issueJson(COPIED_AT)),
			putNoContent: (_path, body) => void pushed.push(body),
		},
		{ files: issueSeed(COPIED_AT, "Rewritten steps.") },
	);
	await jiraUpdate(env, ISSUE_FILE, {});

	expect(pushed).toHaveLength(1);
	expect(env.term.written).toEqual(["Updated PROJ-7."]);
	expect(env.term.asked).toEqual([]);
});

test("jira update: an issue changed on the server is refused before any write", async () => {
	const pushed: unknown[] = [];
	const env = fakeJiraEnv(
		{
			getJson: routed(issueJson("2026-09-02T09:00:00.000Z")),
			putNoContent: (_path, body) => void pushed.push(body),
		},
		{ files: issueSeed(COPIED_AT, "Rewritten steps.") },
	);
	await expect(jiraUpdate(env, ISSUE_FILE, {})).rejects.toThrow(
		"Re-copy the issue or pass --force.",
	);

	expect(pushed).toEqual([]);
	expect(env.term.written).toEqual([]);
});

test("jira update: --dry-run reports the plan and writes nothing", async () => {
	const pushed: unknown[] = [];
	const env = fakeJiraEnv(
		{
			getJson: routed(issueJson(COPIED_AT)),
			putNoContent: (_path, body) => void pushed.push(body),
		},
		{ files: issueSeed(COPIED_AT, "Rewritten steps.") },
	);
	await jiraUpdate(env, ISSUE_FILE, { dryRun: true });

	expect(pushed).toEqual([]);
	expect(env.term.written[0]).toContain("nothing was written (dry run)");
});

test("jira update: with no file argument and no terminal, it names the missing argument", async () => {
	const env = fakeJiraEnv({ getJson: routed(issueJson(COPIED_AT)) });
	await expect(jiraUpdate(env, undefined, {})).rejects.toThrow(
		"Cannot prompt without a terminal. Pass [file].",
	);
});

const PAGE_FILE = join(dir, "page.md");

const PAGE_JSON = {
	"/wiki/api/v2/pages/123?body-format=atlas_doc_format": {
		id: "123",
		title: "Release Notes",
		version: { number: 4 },
	},
	"/wiki/api/v2/pages/123/attachments?limit=250": { results: [] },
};

function pageSeed(body: string): FileSeed {
	return {
		[PAGE_FILE]: [
			"---",
			'id: "123"',
			"version: 4",
			"---",
			"",
			"# Release Notes",
			"",
			body,
			"",
		].join("\n"),
		[join(dir, "shot.png")]: new TextEncoder().encode("png bytes"),
	};
}

test("confluence update: uploads land before the page write, and ids reach the body", async () => {
	const order: string[] = [];
	let written: unknown;
	const env = fakeJiraEnv(
		{
			getJson: routed(PAGE_JSON),
			postMultipart: (path, filename) => {
				order.push(`POST ${path} ${filename}`);
				return { results: [{ extensions: { fileId: "file-9" } }] };
			},
			putJson: (path, body) => {
				order.push(`PUT ${path}`);
				written = body;
				return { version: { number: 5 } };
			},
		},
		{ files: pageSeed("![](shot.png)") },
	);
	await confluenceUpdate(env, PAGE_FILE, {});

	expect(order).toEqual([
		"POST /wiki/rest/api/content/123/child/attachment shot.png",
		"PUT /wiki/api/v2/pages/123",
	]);
	const body = (written as { body: { value: string } }).body.value;
	expect(JSON.parse(body)).toMatchObject({
		content: [{ content: [{ attrs: { id: "file-9" } }] }],
	});
	expect(env.term.errors).toEqual(["Uploading shot.png ..."]);
	expect(env.term.written).toEqual(["Updated page 123 to version 5."]);
});

test("confluence update: a page with no images uploads nothing", async () => {
	const order: string[] = [];
	const env = fakeJiraEnv(
		{
			getJson: routed(PAGE_JSON),
			putJson: (path) => {
				order.push(`PUT ${path}`);
				return { version: { number: 5 } };
			},
		},
		{ files: pageSeed("All good.") },
	);
	await confluenceUpdate(env, PAGE_FILE, {});

	expect(order).toEqual(["PUT /wiki/api/v2/pages/123"]);
	expect(env.term.written).toEqual(["Updated page 123 to version 5."]);
});
