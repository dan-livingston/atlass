import { join, resolve } from "node:path";
import { expect, test } from "vite-plus/test";

import type { JiraIssue } from "#/api/jira-types.ts";

import { planIssueCopy } from "#/copy/plan.ts";
import { runCopy } from "#/copy/run.ts";
import { fakeJiraEnv } from "#/test/env.ts";

const ISSUE: JiraIssue = {
	key: "PROJ-7",
	url: "https://acme.atlassian.net/browse/PROJ-7",
	summary: "Login page broken",
	type: "Bug",
	status: "Open",
	statusCategory: "new",
	assignee: "Ada",
	reporter: "Grace",
	priority: "High",
	labels: [],
	created: "",
	updated: "",
	description: null,
	comments: [],
	attachments: [
		{ mediaId: "a1", filename: "shot.png", url: "u1" },
		{ mediaId: "a2", filename: "shot.png", url: "u2" },
		{ mediaId: "a3", filename: "gone.txt", url: "u3" },
	],
};

const bytes = (text: string) => new TextEncoder().encode(text);

const dir = resolve("out");

function copyEnv() {
	return fakeJiraEnv({
		getBinary: (url) => {
			if (url === "u1") return bytes("one");
			if (url === "u2") return bytes("two");
			throw new Error("404 Not Found");
		},
	});
}

test("runCopy downloads what it can, writes the document with only those, and reports", async () => {
	const env = copyEnv();
	const plan = planIssueCopy(ISSUE, join(dir, "nested"));
	await runCopy(env, plan);

	const assets = join(dir, "nested", "PROJ-7.assets");
	expect(env.files.paths()).toEqual([
		join(assets, "shot-1.png"),
		join(assets, "shot.png"),
		plan.filePath,
	]);
	expect(await env.files.readText(join(assets, "shot-1.png"))).toBe("two");
	const document = await env.files.readText(plan.filePath);
	expect(document).toContain("- [shot.png](PROJ-7.assets/shot-1.png)");
	expect(document).not.toContain("gone.txt");
	expect(env.term.errors).toEqual(["  ! could not download gone.txt: 404 Not Found"]);
	expect(env.term.written).toEqual([`Wrote ${plan.filePath} (+2 attachments)`]);
});

test("runCopy with no attachments writes nothing beside the document", async () => {
	const env = copyEnv();
	const plan = planIssueCopy({ ...ISSUE, attachments: [] }, dir);
	await runCopy(env, plan);

	expect(env.files.paths()).toEqual([plan.filePath]);
	expect(env.term.written).toEqual([`Wrote ${plan.filePath}`]);
});

test("runCopy reports a single attachment in the singular", async () => {
	const env = copyEnv();
	const plan = planIssueCopy({ ...ISSUE, attachments: ISSUE.attachments.slice(0, 1) }, dir);
	await runCopy(env, plan);

	expect(env.term.written).toEqual([`Wrote ${plan.filePath} (+1 attachment)`]);
});
