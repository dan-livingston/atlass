import { expect, test } from "vite-plus/test";

import {
	buildJql,
	buildListJql,
	listAssignedIssues,
	sortByCategoryThenUpdated,
} from "#/api/jira-search.ts";
import { fakeSession } from "#/test/session.ts";

test("jql: no filters falls back to recent issues, since the search endpoint rejects unbounded queries", () => {
	expect(buildJql({ limit: 25 })).toBe("updated >= -30d ORDER BY updated DESC");
});

test("jql: different filters are AND'd", () => {
	expect(buildJql({ project: ["PROJ"], status: ["In Progress"], limit: 25 })).toBe(
		'project = "PROJ" AND status = "In Progress" ORDER BY updated DESC',
	);
});

test("jql: a repeated filter is OR'd within itself", () => {
	expect(buildJql({ status: ["In Progress", "In Review"], limit: 25 })).toBe(
		'status in ("In Progress", "In Review") ORDER BY updated DESC',
	);
});

test("jql: a value keeps any comma in it, since only repeating a flag adds a term", () => {
	expect(buildJql({ status: ["Waiting, blocked"], limit: 25 })).toBe(
		'status = "Waiting, blocked" ORDER BY updated DESC',
	);
});

test("jql: assignee me maps to currentUser() rather than a quoted name", () => {
	expect(buildJql({ assignee: ["me"], limit: 25 })).toBe(
		"assignee = currentUser() ORDER BY updated DESC",
	);
});

test("jql: me survives alongside resolved account ids in an OR", () => {
	expect(buildJql({ assignee: ["me", "5b10a2844c20165700ede21g"], limit: 25 })).toBe(
		'assignee in (currentUser(), "5b10a2844c20165700ede21g") ORDER BY updated DESC',
	);
});

test("jql: reporter takes the same treatment as assignee", () => {
	expect(buildJql({ reporter: ["me"], limit: 25 })).toBe(
		"reporter = currentUser() ORDER BY updated DESC",
	);
});

test("jql: open excludes the Done category", () => {
	expect(buildJql({ project: ["PROJ"], open: true, limit: 25 })).toBe(
		'project = "PROJ" AND statusCategory != Done ORDER BY updated DESC',
	);
});

test("jql: type filters on the issue type", () => {
	expect(buildJql({ type: ["Bug", "Task"], limit: 25 })).toBe(
		'type in ("Bug", "Task") ORDER BY updated DESC',
	);
});

test("jql: updated is a floor on an absolute date", () => {
	expect(buildJql({ updatedSince: "2026-08-28", limit: 25 })).toBe(
		'updated >= "2026-08-28" ORDER BY updated DESC',
	);
});

test("jql: text query is escaped", () => {
	expect(buildJql({ text: 'say "hi"', limit: 25 })).toBe(
		'text ~ "say \\"hi\\"" ORDER BY updated DESC',
	);
});

test("jql: every filter at once keeps a stable clause order", () => {
	expect(
		buildJql({
			text: "login",
			project: ["PROJ"],
			type: ["Bug"],
			status: ["To Do"],
			open: true,
			assignee: ["me"],
			reporter: ["me"],
			label: ["regression"],
			updatedSince: "2026-08-28",
			limit: 25,
		}),
	).toBe(
		'project = "PROJ" AND type = "Bug" AND status = "To Do" AND statusCategory != Done' +
			' AND assignee = currentUser() AND reporter = currentUser() AND labels = "regression"' +
			' AND updated >= "2026-08-28" AND text ~ "login" ORDER BY updated DESC',
	);
});

test("list jql: defaults to the current user's issues outside the Done category", () => {
	expect(buildListJql({})).toBe(
		"assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC",
	);
});

test("list jql: --all keeps open issues and adds Done issues updated in the last 30 days", () => {
	expect(buildListJql({ all: true })).toBe(
		"assignee = currentUser() AND (statusCategory != Done OR updated >= -30d) ORDER BY updated DESC",
	);
});

test("list jql: project filter is quoted and AND'd", () => {
	expect(buildListJql({ project: "PROJ" })).toBe(
		'assignee = currentUser() AND project = "PROJ" AND statusCategory != Done ORDER BY updated DESC',
	);
});

function issuePage(keys: string[], nextPageToken?: string) {
	return {
		issues: keys.map((key) => ({
			key,
			fields: {
				summary: `Summary ${key}`,
				status: { name: "In Progress", statusCategory: { key: "indeterminate" } },
				updated: "2026-08-30T10:00:00.000+0000",
			},
		})),
		isLast: nextPageToken === undefined,
		...(nextPageToken ? { nextPageToken } : {}),
	};
}

test("list: follows page tokens until the last page and keeps category and updated", async () => {
	const paths: string[] = [];
	const client = fakeSession({
		getJson: async (path: string) => {
			paths.push(path);
			return path.includes("nextPageToken=t2")
				? issuePage(["PROJ-3"])
				: issuePage(["PROJ-1", "PROJ-2"], "t2");
		},
	});
	const res = await listAssignedIssues(client, "https://acme.atlassian.net", {});
	expect(res.issues.map((i) => i.key)).toEqual(["PROJ-1", "PROJ-2", "PROJ-3"]);
	expect(res.issues[0]).toEqual({
		key: "PROJ-1",
		status: "In Progress",
		statusCategory: "indeterminate",
		summary: "Summary PROJ-1",
		updated: "2026-08-30T10:00:00.000+0000",
		url: "https://acme.atlassian.net/browse/PROJ-1",
	});
	expect(res.truncated).toBe(false);
	expect(paths).toHaveLength(2);
	expect(paths[0]).not.toContain("nextPageToken");
	expect(paths[1]).toContain("nextPageToken=t2");
});

test("list: stops at the cap and reports truncation when the server still has more", async () => {
	let page = 0;
	const client = fakeSession({
		getJson: async () => {
			page++;
			const keys = Array.from({ length: 100 }, (_, i) => `PROJ-${page * 100 + i}`);
			return issuePage(keys, `t${page + 1}`);
		},
	});
	const res = await listAssignedIssues(client, "https://acme.atlassian.net", {});
	expect(res.issues).toHaveLength(500);
	expect(res.truncated).toBe(true);
	expect(page).toBe(5);
});

function summary(key: string, statusCategory: string, updated: string) {
	return { key, status: "", statusCategory, summary: "", updated, url: "" };
}

test("list sort: in progress first, then to do, then done, newest update first within each", () => {
	expect(
		sortByCategoryThenUpdated([
			summary("TODO-old", "new", "2026-08-01T00:00:00.000+0000"),
			summary("DONE", "done", "2026-08-30T00:00:00.000+0000"),
			summary("WIP-old", "indeterminate", "2026-08-10T00:00:00.000+0000"),
			summary("TODO-new", "new", "2026-08-20T00:00:00.000+0000"),
			summary("WIP-new", "indeterminate", "2026-08-15T00:00:00.000+0000"),
		]).map((i) => i.key),
	).toEqual(["WIP-new", "WIP-old", "TODO-new", "TODO-old", "DONE"]);
});

test("list sort: compares updated as instants, not as strings, across offsets", () => {
	expect(
		sortByCategoryThenUpdated([
			summary("A", "new", "2026-08-20T10:00:00.000+0000"),
			summary("B", "new", "2026-08-20T11:00:00.000+0200"),
		]).map((i) => i.key),
	).toEqual(["A", "B"]);
});

test("list sort: unknown category sorts last", () => {
	expect(
		sortByCategoryThenUpdated([
			summary("X", "", "2026-08-30T00:00:00.000+0000"),
			summary("D", "done", "2026-08-01T00:00:00.000+0000"),
		]).map((i) => i.key),
	).toEqual(["D", "X"]);
});
