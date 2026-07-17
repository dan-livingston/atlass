import { expect, test } from "vite-plus/test";

import { formatProjectRows, formatStatusRows } from "./jira.ts";

test("projects: key column is padded so names align", () => {
	expect(
		formatProjectRows([
			{ key: "OPS", name: "Operations" },
			{ key: "PLATFORM", name: "Platform" },
		]),
	).toEqual(["OPS       Operations", "PLATFORM  Platform"]);
});

test("projects: a single row needs no extra padding", () => {
	expect(formatProjectRows([{ key: "OPS", name: "Operations" }])).toEqual(["OPS  Operations"]);
});

test("statuses: name column is padded so categories align", () => {
	expect(
		formatStatusRows([
			{ name: "To Do", category: "To Do" },
			{ name: "In Progress", category: "In Progress" },
		]),
	).toEqual(["To Do        To Do", "In Progress  In Progress"]);
});

test("statuses: a single row needs no extra padding", () => {
	expect(formatStatusRows([{ name: "Done", category: "Done" }])).toEqual(["Done  Done"]);
});
