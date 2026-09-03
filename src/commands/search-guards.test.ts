import kleur from "kleur";
import { expect, test } from "vite-plus/test";

import { confluenceList, confluenceSearch } from "#/commands/confluence.ts";
import { jiraList, jiraSearch } from "#/commands/jira-search.ts";
import { fakeJiraEnv } from "#/test/env.ts";

kleur.enabled = false;

function unreachable(seen: string[]) {
	return {
		getJson: (path: string) => {
			seen.push(path);
			return { issues: [], results: [], values: [], isLast: true };
		},
	};
}

test("jira search: --jql and a text query are refused before anything is fetched", async () => {
	const seen: string[] = [];
	const env = fakeJiraEnv(unreachable(seen));
	await expect(jiraSearch(env, "login", { jql: "project = PROJ" })).rejects.toThrow(
		"--jql cannot be combined with a text query or other filters.",
	);
	expect(seen).toEqual([]);
});

test("jira search: --jql and a filter flag are refused too", async () => {
	const env = fakeJiraEnv(unreachable([]));
	await expect(
		jiraSearch(env, undefined, { jql: "project = PROJ", assignee: "me" }),
	).rejects.toThrow("--jql cannot be combined with a text query or other filters.");
});

test("jira search: --json and --copy are refused as a pair", async () => {
	const seen: string[] = [];
	const env = fakeJiraEnv(unreachable(seen));
	await expect(jiraSearch(env, undefined, { json: true, copy: true })).rejects.toThrow(
		"--json and --copy cannot be used together.",
	);
	expect(seen).toEqual([]);
});

test("jira list: --json and --copy are refused by the list command as well", async () => {
	const env = fakeJiraEnv(unreachable([]));
	await expect(jiraList(env, { json: true, copy: true })).rejects.toThrow(
		"--json and --copy cannot be used together.",
	);
});

test("confluence search: --cql and a text query are refused", async () => {
	const seen: string[] = [];
	const env = fakeJiraEnv(unreachable(seen));
	await expect(confluenceSearch(env, "notes", { cql: 'type="page"' })).rejects.toThrow(
		"--cql cannot be combined with a text query or --space.",
	);
	expect(seen).toEqual([]);
});

test("confluence search: --cql and --space are refused", async () => {
	const env = fakeJiraEnv(unreachable([]));
	await expect(
		confluenceSearch(env, undefined, { cql: 'type="page"', space: "DEV" }),
	).rejects.toThrow("--cql cannot be combined with a text query or --space.");
});

test("confluence list: --json and --copy are refused", async () => {
	const env = fakeJiraEnv(unreachable([]));
	await expect(confluenceList(env, { json: true, copy: true })).rejects.toThrow(
		"--json and --copy cannot be used together.",
	);
});

test("confluence list: no starred pages names the space when one was given", async () => {
	const env = fakeJiraEnv({ getJson: () => ({ results: [], _links: {} }) });
	await confluenceList(env, { space: "DEV" });

	expect(env.term.written).toEqual(["No starred pages in DEV."]);
});

test("confluence list: no starred pages anywhere says so plainly", async () => {
	const env = fakeJiraEnv({ getJson: () => ({ results: [], _links: {} }) });
	await confluenceList(env, {});

	expect(env.term.written).toEqual(["No starred pages."]);
});
