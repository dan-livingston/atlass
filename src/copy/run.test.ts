import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vite-plus/test";

import type { JiraIssue } from "#/api/jira-types.ts";

import { planIssueCopy } from "#/copy/plan.ts";
import { runCopy } from "#/copy/run.ts";
import { scriptedTerminal } from "#/terminal/scripted.ts";

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

async function fetchBytes(url: string): Promise<Uint8Array> {
	if (url === "u1") return bytes("one");
	if (url === "u2") return bytes("two");
	throw new Error("404 Not Found");
}

let dir: string;
let term: ReturnType<typeof scriptedTerminal>;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "atlass-run-"));
	term = scriptedTerminal();
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

test("runCopy downloads what it can, writes the document with only those, and reports", async () => {
	const plan = planIssueCopy(ISSUE, join(dir, "out"));
	await runCopy(term, plan, fetchBytes);

	expect((await readdir(join(dir, "out", "PROJ-7.assets"))).sort()).toEqual([
		"shot-1.png",
		"shot.png",
	]);
	expect(await readFile(join(dir, "out", "PROJ-7.assets", "shot-1.png"), "utf8")).toBe("two");
	const document = await readFile(plan.filePath, "utf8");
	expect(document).toContain("- [shot.png](PROJ-7.assets/shot-1.png)");
	expect(document).not.toContain("gone.txt");
	expect(term.errors).toEqual(["  ! could not download gone.txt: 404 Not Found"]);
	expect(term.written).toEqual([`Wrote ${plan.filePath} (+2 attachments)`]);
});

test("runCopy with no attachments creates no assets dir and reports a bare wrote line", async () => {
	const plan = planIssueCopy({ ...ISSUE, attachments: [] }, dir);
	await runCopy(term, plan, fetchBytes);

	expect(await readdir(dir)).toEqual(["PROJ-7.md"]);
	expect(term.written).toEqual([`Wrote ${plan.filePath}`]);
});

test("runCopy reports a single attachment in the singular", async () => {
	const plan = planIssueCopy({ ...ISSUE, attachments: ISSUE.attachments.slice(0, 1) }, dir);
	await runCopy(term, plan, fetchBytes);

	expect(term.written).toEqual([`Wrote ${plan.filePath} (+1 attachment)`]);
});
