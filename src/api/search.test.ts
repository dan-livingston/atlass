import { expect, test } from "vite-plus/test";

import { buildCql } from "./confluence.ts";
import { buildJql, dedupeAndSortStatuses, projectSearchQuery } from "./jira.ts";

test("jql: empty query falls back to a bounded recent query", () => {
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

test("cql: raw cql is used verbatim", () => {
	expect(buildCql({ cql: "type = blogpost", space: "IGNORED", limit: 25 })).toBe(
		"type = blogpost",
	);
});
