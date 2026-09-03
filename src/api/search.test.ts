import { expect, test } from "vite-plus/test";

import type { AtlassianClient } from "#/api/client.ts";

import { buildCql, searchPages } from "#/api/confluence.ts";
import { projectSearchQuery } from "#/api/jira-projects.ts";
import {
	buildJql,
	buildListJql,
	listAssignedIssues,
	sortByCategoryThenUpdated,
} from "#/api/jira-search.ts";
import { dedupeAndSortStatuses } from "#/api/jira-statuses.ts";

test("jql: empty query falls back to recent issues, since the search endpoint rejects unbounded queries", () => {
	expect(buildJql({ limit: 25 })).toBe("updated >= -30d ORDER BY updated DESC");
});

test("jql: friendly clauses are AND'd", () => {
	expect(buildJql({ project: "PROJ", status: "In Progress", limit: 25 })).toBe(
		'project = "PROJ" AND status = "In Progress" ORDER BY updated DESC',
	);
});

test("jql: assignee me maps to currentUser()", () => {
	expect(buildJql({ assignee: "me", limit: 25 })).toBe(
		"assignee = currentUser() ORDER BY updated DESC",
	);
});

test("jql: named assignee is quoted", () => {
	expect(buildJql({ assignee: "Dana Scully", limit: 25 })).toBe(
		'assignee = "Dana Scully" ORDER BY updated DESC',
	);
});

test("jql: text query is escaped", () => {
	expect(buildJql({ text: 'say "hi"', limit: 25 })).toBe(
		'text ~ "say \\"hi\\"" ORDER BY updated DESC',
	);
});

test("jql: raw jql is used verbatim", () => {
	expect(buildJql({ jql: "assignee = currentUser()", project: "IGNORED", limit: 25 })).toBe(
		"assignee = currentUser()",
	);
});

test("projects: paged query orders by key and carries startAt", () => {
	expect(projectSearchQuery(undefined, 0)).toBe("orderBy=key&maxResults=50&startAt=0");
});

test("projects: later page advances startAt", () => {
	expect(projectSearchQuery(undefined, 50)).toBe("orderBy=key&maxResults=50&startAt=50");
});

test("projects: text filter is passed as query", () => {
	expect(projectSearchQuery("pay ops", 0)).toBe(
		"orderBy=key&maxResults=50&startAt=0&query=pay+ops",
	);
});

function status(name: string, id: string, category: string, categoryKey: string) {
	return { name, id, category, categoryKey };
}

test("statuses: sorted by category lifecycle then name", () => {
	expect(
		dedupeAndSortStatuses([
			status("Done", "3", "Done", "done"),
			status("In Review", "2", "In Progress", "indeterminate"),
			status("Backlog", "1", "To Do", "new"),
			status("In Progress", "4", "In Progress", "indeterminate"),
		]).map((s) => s.name),
	).toEqual(["Backlog", "In Progress", "In Review", "Done"]);
});

test("statuses: same name and category collapse across ids", () => {
	expect(
		dedupeAndSortStatuses([
			status("To Do", "1", "To Do", "new"),
			status("To Do", "2", "To Do", "new"),
			status("Done", "3", "Done", "done"),
		]).map((s) => s.id),
	).toEqual(["1", "3"]);
});

test("statuses: same name but different category are kept apart", () => {
	expect(
		dedupeAndSortStatuses([
			status("Review", "1", "To Do", "new"),
			status("Review", "2", "In Progress", "indeterminate"),
		]).map((s) => s.category),
	).toEqual(["To Do", "In Progress"]);
});

test("statuses: unknown category sorts last", () => {
	expect(
		dedupeAndSortStatuses([
			status("Weird", "2", "No Category", "undefined"),
			status("To Do", "1", "To Do", "new"),
		]).map((s) => s.name),
	).toEqual(["To Do", "Weird"]);
});

test("cql: friendly mode always constrains to pages", () => {
	expect(buildCql({ limit: 25 })).toBe("type = page ORDER BY lastmodified DESC");
});

test("cql: space and text are AND'd after type", () => {
	expect(buildCql({ space: "DOCS", text: "onboarding", limit: 25 })).toBe(
		'type = page AND space = "DOCS" AND text ~ "onboarding" ORDER BY lastmodified DESC',
	);
});

test("cql: starred lists the current user's favourites, still constrained to pages", () => {
	expect(buildCql({ starred: true, space: "DOCS", limit: 25 })).toBe(
		'type = page AND favourite = currentUser() AND space = "DOCS" ORDER BY lastmodified DESC',
	);
});

test("cql: raw cql is used verbatim", () => {
	expect(buildCql({ cql: "type = blogpost", space: "IGNORED", limit: 25 })).toBe(
		"type = blogpost",
	);
});

test("cql search: a full server page means more results, even when rows without a content id are dropped", async () => {
	const client = {
		getJson: async () => ({
			results: [{ content: { id: "1", title: "A" } }, { title: "orphan result" }],
		}),
	} as unknown as AtlassianClient;
	const res = await searchPages(client, "https://acme.atlassian.net", { limit: 2 });
	expect(res.pages.map((p) => p.id)).toEqual(["1"]);
	expect(res.hasMore).toBe(true);
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
	const client = {
		getJson: async (path: string) => {
			paths.push(path);
			return path.includes("nextPageToken=t2")
				? issuePage(["PROJ-3"])
				: issuePage(["PROJ-1", "PROJ-2"], "t2");
		},
	} as unknown as AtlassianClient;
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
	const client = {
		getJson: async () => {
			page++;
			const keys = Array.from({ length: 100 }, (_, i) => `PROJ-${page * 100 + i}`);
			return issuePage(keys, `t${page + 1}`);
		},
	} as unknown as AtlassianClient;
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

test("cql search: last modified is carried through as updated", async () => {
	const client = {
		getJson: async () => ({
			results: [
				{ content: { id: "1", title: "A" }, lastModified: "2026-08-30T10:00:00.000Z" },
				{ content: { id: "2", title: "B" } },
			],
		}),
	} as unknown as AtlassianClient;
	const res = await searchPages(client, "https://acme.atlassian.net", { limit: 25 });
	expect(res.pages.map((p) => p.updated)).toEqual(["2026-08-30T10:00:00.000Z", ""]);
});
