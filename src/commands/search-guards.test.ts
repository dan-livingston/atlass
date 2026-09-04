import kleur from "kleur";
import { expect, test } from "vite-plus/test";

import { confluenceCql, confluenceList, confluenceSearch } from "#/commands/confluence-search.ts";
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

test("jira search: nothing to search on is refused before anything is fetched", async () => {
	const seen: string[] = [];
	const env = fakeJiraEnv(unreachable(seen));
	await expect(jiraSearch(env, undefined, {})).rejects.toThrow(
		"Give a text query or at least one filter. `jira list` shows your open issues.",
	);
	expect(seen).toEqual([]);
});

test("jira search: a lone filter is enough to search on", async () => {
	const seen: string[] = [];
	const env = fakeJiraEnv(unreachable(seen));
	await jiraSearch(env, undefined, { open: true });
	expect(seen).toHaveLength(1);
});

test("jira search: an issue key as the query points at view rather than searching for it", async () => {
	const seen: string[] = [];
	const env = fakeJiraEnv(unreachable(seen));
	await expect(jiraSearch(env, "PROJ-123", {})).rejects.toThrow(
		'"PROJ-123" looks like an issue key. Run `jira view PROJ-123` to open it.',
	);
	expect(seen).toEqual([]);
});

test("jira search: a key-shaped word inside a longer query is still a text search", async () => {
	const seen: string[] = [];
	const env = fakeJiraEnv(unreachable(seen));
	await jiraSearch(env, "PROJ-123 regression", {});
	expect(seen).toHaveLength(1);
});

test("jira search: --json and --copy are refused as a pair", async () => {
	const seen: string[] = [];
	const env = fakeJiraEnv(unreachable(seen));
	await expect(jiraSearch(env, "login", { json: true, copy: true })).rejects.toThrow(
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

test("confluence search: --json and --copy are refused as a pair", async () => {
	const seen: string[] = [];
	const env = fakeJiraEnv(unreachable(seen));
	await expect(confluenceSearch(env, "notes", { json: true, copy: true })).rejects.toThrow(
		"--json and --copy cannot be used together.",
	);
	expect(seen).toEqual([]);
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

test("confluence search: filters reach the query and the window is only set when asked", async () => {
	const paths: string[] = [];
	const env = fakeJiraEnv({
		getJson: (path: string) => {
			paths.push(path);
			return { results: [] };
		},
	});
	await confluenceSearch(env, "onboarding", {
		space: ["DOCS", "ENG"],
		label: ["runbook"],
		updated: "2026-01-01",
	});

	expect(new URL(paths[0]!, "https://x").searchParams.get("cql")).toBe(
		'type = page AND space in ("DOCS", "ENG") AND label = "runbook"' +
			' AND lastmodified >= "2026-01-01" AND text ~ "onboarding" ORDER BY lastmodified DESC',
	);
});

test("confluence cql: the query reaches the server untouched", async () => {
	const paths: string[] = [];
	const env = fakeJiraEnv({
		getJson: (path: string) => {
			paths.push(path);
			return { results: [] };
		},
	});
	await confluenceCql(env, "label = runbook ORDER BY created", {});

	expect(new URL(paths[0]!, "https://x").searchParams.get("cql")).toBe(
		"label = runbook ORDER BY created",
	);
});
