import kleur from "kleur";
import { expect, test } from "vite-plus/test";

import { jiraCreate, jiraFields } from "#/commands/jira-create.ts";
import { fakeJiraEnv, routed } from "#/test/env.ts";

kleur.enabled = false;

const TYPES = "/rest/api/3/issue/createmeta/PROJ/issuetypes?startAt=0&maxResults=200";
const FIELDS = "/rest/api/3/issue/createmeta/PROJ/issuetypes/10001?startAt=0&maxResults=200";

const META = {
	[TYPES]: {
		total: 1,
		issueTypes: [{ id: "10001", name: "Bug", description: "A problem", subtask: false }],
	},
	[FIELDS]: {
		total: 2,
		fields: [
			{ fieldId: "summary", name: "Summary", required: true, schema: { type: "string" } },
			{
				fieldId: "description",
				name: "Description",
				required: false,
				schema: { type: "doc" },
			},
		],
	},
};

function createEnv(answers?: unknown[]) {
	return fakeJiraEnv(
		{
			getJson: routed(META),
			postJson: () => ({ id: "1", key: "PROJ-9" }),
		},
		answers ? { answers } : {},
	);
}

test("flags alone create the issue without prompting or reviewing", async () => {
	const env = createEnv();
	await jiraCreate(env, "PROJ", "Bug", { summary: "Login broken" });

	expect(env.term.asked).toEqual([]);
	expect(env.term.written).toEqual(["Created PROJ-9  https://acme.atlassian.net/browse/PROJ-9"]);
});

test("--json emits the created issue instead of the one-line report", async () => {
	const env = createEnv();
	await jiraCreate(env, "PROJ", "Bug", { summary: "Login broken", json: true });

	expect(env.term.emitted).toEqual([
		{ id: "1", key: "PROJ-9", url: "https://acme.atlassian.net/browse/PROJ-9" },
	]);
	expect(env.term.written).toEqual([]);
});

test("--dry-run emits the payload it would post and posts nothing", async () => {
	let posted = 0;
	const env = fakeJiraEnv({
		getJson: routed(META),
		postJson: () => {
			posted++;
			return { id: "1", key: "PROJ-9" };
		},
	});
	await jiraCreate(env, "PROJ", "Bug", { summary: "Login broken", dryRun: true });

	expect(posted).toBe(0);
	expect(env.term.emitted).toEqual([
		{
			fields: {
				project: { key: "PROJ" },
				issuetype: { id: "10001" },
				summary: "Login broken",
			},
		},
	]);
});

test("a missing required field is reported rather than posted", async () => {
	const env = createEnv();
	await expect(jiraCreate(env, "PROJ", "Bug", { field: ["description=hi"] })).rejects.toThrow(
		"Summary",
	);
});

test("an unknown issue type lists the ones the project has", async () => {
	const env = createEnv();
	await expect(jiraCreate(env, "PROJ", "Epic", { summary: "x" })).rejects.toThrow(
		'PROJ has no issue type "Epic"; available: Bug.',
	);
});

test("with a terminal to ask, the review is shown and a yes creates the issue", async () => {
	const env = createEnv(["Login broken", [], true]);
	await jiraCreate(env, "PROJ", "Bug", {});

	expect(env.term.asked.map((a) => a.kind)).toEqual(["text", "pickMany", "confirm"]);
	expect(env.term.written).toEqual([
		"Summary:  Login broken",
		"Created PROJ-9  https://acme.atlassian.net/browse/PROJ-9",
	]);
});

test("declining the review aborts before the issue is posted", async () => {
	let posted = 0;
	const env = fakeJiraEnv(
		{
			getJson: routed(META),
			postJson: () => {
				posted++;
				return { id: "1", key: "PROJ-9" };
			},
		},
		{ answers: ["Login broken", [], false] },
	);
	await jiraCreate(env, "PROJ", "Bug", {});

	expect(posted).toBe(0);
	expect(env.term.written.at(-1)).toBe("Aborted.");
});

test("jira fields lists the issue types a project offers", async () => {
	const env = createEnv();
	await jiraFields(env, "proj", undefined, {});

	expect(env.term.written).toEqual(["Bug  A problem"]);
});
