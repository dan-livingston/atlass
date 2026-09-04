import { expect, test } from "vite-plus/test";

import { projectSearchQuery } from "#/api/jira-projects.ts";
import { dedupeAndSortStatuses } from "#/api/jira-statuses.ts";

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
