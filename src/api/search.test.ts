import { expect, test } from "vite-plus/test";

import { buildCql } from "./confluence.ts";
import { buildJql, projectSearchQuery } from "./jira.ts";

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
