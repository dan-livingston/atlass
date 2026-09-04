import { expect, test } from "vite-plus/test";

import { HttpError } from "#/api/http-error.ts";
import { searchHint } from "#/commands/jira-filters.ts";
import { jiraJql, jiraSearch } from "#/commands/jira-search.ts";
import { fakeJiraEnv } from "#/test/env.ts";

const EMPTY = { issues: [] };

function capturing(paths: string[]) {
	return {
		getJson: (path: string) => {
			paths.push(path);
			return EMPTY;
		},
	};
}

function jqlOf(path: string): string {
	return new URL(path, "https://x").searchParams.get("jql") ?? "";
}

test("search: an assignee name is resolved to an account id, since jql rejects display names", async () => {
	const paths: string[] = [];
	const env = fakeJiraEnv({
		getJson: (path: string) => {
			paths.push(path);
			if (path.startsWith("/rest/api/3/user/search")) {
				return [{ accountId: "acc-1", displayName: "Dana Scully", active: true }];
			}
			return EMPTY;
		},
	});
	await jiraSearch(env, undefined, { assignee: ["Dana Scully"] });

	expect(paths[0]).toContain("/rest/api/3/user/search?query=Dana+Scully");
	expect(jqlOf(paths[1]!)).toContain('assignee = "acc-1"');
});

test("search: me is left for jql to expand rather than costing a lookup", async () => {
	const paths: string[] = [];
	const env = fakeJiraEnv(capturing(paths));
	await jiraSearch(env, undefined, { assignee: ["me"] });

	expect(paths).toHaveLength(1);
	expect(jqlOf(paths[0]!)).toContain("assignee = currentUser()");
});

test("search: an account id is passed through without a lookup", async () => {
	const paths: string[] = [];
	const env = fakeJiraEnv(capturing(paths));
	await jiraSearch(env, undefined, { reporter: ["5b10a2844c20165700ede21g"] });

	expect(paths).toHaveLength(1);
	expect(jqlOf(paths[0]!)).toContain('reporter = "5b10a2844c20165700ede21g"');
});

test("search: an ambiguous name is reported rather than guessed at", async () => {
	const env = fakeJiraEnv({
		getJson: (path: string) =>
			path.startsWith("/rest/api/3/user/search")
				? [
						{ accountId: "a", displayName: "Dana Scully", active: true },
						{ accountId: "b", displayName: "Dana Barrett", active: true },
					]
				: EMPTY,
	});
	await expect(jiraSearch(env, undefined, { assignee: ["dana"] })).rejects.toThrow(
		'"dana" matches 2 users: Dana Scully, Dana Barrett.',
	);
});

test("search: filters alone search all of history, since --limit already bounds the rows", async () => {
	const paths: string[] = [];
	const env = fakeJiraEnv(capturing(paths));
	await jiraSearch(env, undefined, { project: ["PROJ"] });

	expect(jqlOf(paths[0]!)).toBe('project = "PROJ" ORDER BY updated DESC');
});

test("search: a text query searches all of history too", async () => {
	const paths: string[] = [];
	const env = fakeJiraEnv(capturing(paths));
	await jiraSearch(env, "login", {});

	expect(jqlOf(paths[0]!)).toBe('text ~ "login" ORDER BY updated DESC');
});

test("search: --updated is the only thing that bounds the window", async () => {
	const paths: string[] = [];
	const env = fakeJiraEnv(capturing(paths));
	await jiraSearch(env, undefined, { project: ["PROJ"], updated: "2026-01-01" });

	expect(jqlOf(paths[0]!)).toContain('updated >= "2026-01-01"');
});

test("jql: the query reaches the server untouched, ORDER BY included", async () => {
	const paths: string[] = [];
	const env = fakeJiraEnv(capturing(paths));
	await jiraJql(env, "labels = flaky ORDER BY created ASC", {});

	expect(jqlOf(paths[0]!)).toBe("labels = flaky ORDER BY created ASC");
});

test("jql: --limit still applies to a raw query", async () => {
	const paths: string[] = [];
	const env = fakeJiraEnv(capturing(paths));
	await jiraJql(env, "labels = flaky", { limit: "5" });

	expect(paths[0]).toContain("maxResults=5");
});

function badRequest(detail: string) {
	return new HttpError(400, `Bad request (400): ${detail}`);
}

test("hint: an unknown status points at the command that lists statuses", () => {
	const err = searchHint(
		badRequest("The value 'In Progres' does not exist for the field 'status'."),
		["PROJ"],
	);
	expect((err as Error).message).toBe(
		"Bad request (400): The value 'In Progres' does not exist for the field 'status'." +
			" Run `jira statuses --project PROJ` to see the options.",
	);
});

test("hint: without a project the status pointer stays unscoped", () => {
	const err = searchHint(
		badRequest("The value 'Nope' does not exist for the field 'status'."),
		undefined,
	);
	expect((err as Error).message).toContain("Run `jira statuses` to see the options.");
});

test("hint: an unknown issue type points at the create form", () => {
	const err = searchHint(
		badRequest("The value 'Buug' does not exist for the field 'issuetype'."),
		["PROJ"],
	);
	expect((err as Error).message).toContain("Run `jira fields PROJ` to see the options.");
});

test("hint: a field with no discovery command is left alone", () => {
	const original = badRequest("The value 'x' does not exist for the field 'sprint'.");
	expect(searchHint(original, ["PROJ"])).toBe(original);
});

test("hint: errors that are not bad requests pass straight through", () => {
	const original = new HttpError(500, "Request failed (500)");
	expect(searchHint(original, undefined)).toBe(original);
});
