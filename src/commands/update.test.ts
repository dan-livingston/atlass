import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vite-plus/test";

import { confluenceUpdate } from "#/commands/confluence.ts";
import { jiraUpdate } from "#/commands/jira.ts";
import { fakeEnv, routed } from "#/test/env.ts";

let dir: string;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "atlass-update-"));
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

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

async function issueFile(updated: string, body: string): Promise<string> {
	const path = join(dir, "PROJ-7.md");
	await writeFile(
		path,
		[
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
		"utf8",
	);
	return path;
}

const COPIED_AT = "2026-09-01T09:00:00.000Z";

test("jira update: an unchanged issue is pushed and the result reported", async () => {
	const pushed: unknown[] = [];
	const env = fakeEnv({
		getJson: routed(issueJson(COPIED_AT)),
		putNoContent: (_path, body) => void pushed.push(body),
	});
	await jiraUpdate(env, await issueFile(COPIED_AT, "Rewritten steps."), {});

	expect(pushed).toHaveLength(1);
	expect(env.term.written).toEqual(["Updated PROJ-7."]);
	expect(env.term.asked).toEqual([]);
});

test("jira update: an issue changed on the server is refused before any write", async () => {
	const pushed: unknown[] = [];
	const env = fakeEnv({
		getJson: routed(issueJson("2026-09-02T09:00:00.000Z")),
		putNoContent: (_path, body) => void pushed.push(body),
	});
	await expect(
		jiraUpdate(env, await issueFile(COPIED_AT, "Rewritten steps."), {}),
	).rejects.toThrow("Re-copy the issue or pass --force.");

	expect(pushed).toEqual([]);
	expect(env.term.written).toEqual([]);
});

test("jira update: --dry-run reports the plan and writes nothing", async () => {
	const pushed: unknown[] = [];
	const env = fakeEnv({
		getJson: routed(issueJson(COPIED_AT)),
		putNoContent: (_path, body) => void pushed.push(body),
	});
	await jiraUpdate(env, await issueFile(COPIED_AT, "Rewritten steps."), { dryRun: true });

	expect(pushed).toEqual([]);
	expect(env.term.written[0]).toContain("nothing was written (dry run)");
});

test("jira update: with no file argument and no terminal, it names the missing argument", async () => {
	const env = fakeEnv({ getJson: routed(issueJson(COPIED_AT)) });
	await expect(jiraUpdate(env, undefined, {})).rejects.toThrow(
		"Cannot prompt without a terminal. Pass [file].",
	);
});

test("confluence update: uploads land before the page write, and ids reach the body", async () => {
	const order: string[] = [];
	const path = join(dir, "page.md");
	await writeFile(
		path,
		["---", 'id: "123"', "version: 4", "---", "", "# Release Notes", "", "All good.", ""].join(
			"\n",
		),
		"utf8",
	);
	const env = fakeEnv({
		getJson: routed({
			"/wiki/api/v2/pages/123?body-format=atlas_doc_format": {
				id: "123",
				title: "Release Notes",
				version: { number: 4 },
			},
			"/wiki/api/v2/pages/123/attachments?limit=250": { results: [] },
		}),
		putJson: (p) => {
			order.push(`PUT ${p}`);
			return { version: { number: 5 } };
		},
	});
	await confluenceUpdate(env, path, {});

	expect(order).toEqual(["PUT /wiki/api/v2/pages/123"]);
	expect(env.term.written).toEqual(["Updated page 123 to version 5."]);
});
