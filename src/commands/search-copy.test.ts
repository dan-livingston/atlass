import kleur from "kleur";
import { expect, test } from "vite-plus/test";

import type { SearchRow } from "#/commands/search-run.ts";

import { runSearch } from "#/commands/search-run.ts";
import { scriptedTerminal } from "#/terminal/scripted.ts";

kleur.enabled = false;

const NOUN = { singular: "issue", plural: "issues" };

function rows(...ids: string[]): SearchRow[] {
	return ids.map((id) => ({
		id,
		url: `https://acme.atlassian.net/browse/${id}`,
		fixedColumns: `${id}  To Do`,
		freeText: `summary for ${id}`,
		json: { key: id },
	}));
}

const never = async () => {
	throw new Error("copyOne should not have been called");
};

test("without --copy the rows are printed and nothing is asked", async () => {
	const term = scriptedTerminal();
	await runSearch(term, rows("PROJ-1"), { empty: "none" }, NOUN, never);

	expect(term.written).toEqual(["PROJ-1  To Do  summary for PROJ-1"]);
	expect(term.asked).toEqual([]);
});

test("--json emits the rows' payloads and prints no lines", async () => {
	const term = scriptedTerminal();
	await runSearch(term, rows("PROJ-1", "PROJ-2"), { empty: "none", json: true }, NOUN, never);

	expect(term.emitted).toEqual([[{ key: "PROJ-1" }, { key: "PROJ-2" }]]);
	expect(term.written).toEqual([]);
});

test("--copy on a non-interactive terminal refuses before offering a selection", async () => {
	const term = scriptedTerminal();
	await expect(
		runSearch(term, rows("PROJ-1"), { empty: "none", copy: true }, NOUN, never),
	).rejects.toThrow("--copy requires an interactive terminal.");
});

test("--copy with an .md out path refuses rather than overwriting each selection", async () => {
	const term = scriptedTerminal({ answers: [] });
	await expect(
		runSearch(
			term,
			rows("PROJ-1"),
			{ empty: "none", copy: true, out: "notes.md" },
			NOUN,
			never,
		),
	).rejects.toThrow("--out must be a directory when using --copy");
});

test("--copy copies every selected row and reports the count", async () => {
	const copied: string[] = [];
	const term = scriptedTerminal({ answers: [["PROJ-1", "PROJ-3"]] });
	await runSearch(
		term,
		rows("PROJ-1", "PROJ-2", "PROJ-3"),
		{ empty: "none", copy: true },
		NOUN,
		async (id) => void copied.push(id),
	);

	expect(copied.sort()).toEqual(["PROJ-1", "PROJ-3"]);
	expect(term.written).toEqual(["Copied 2 issues"]);
});

test("--copy reports the failures alongside the count, and still copies the rest", async () => {
	const term = scriptedTerminal({ answers: [["PROJ-1", "PROJ-2"]] });
	await runSearch(
		term,
		rows("PROJ-1", "PROJ-2"),
		{ empty: "none", copy: true },
		NOUN,
		async (id) => {
			if (id === "PROJ-2") throw new Error("404 Not Found");
		},
	);

	expect(term.written).toEqual(["Copied 1 issue, failed 1: PROJ-2 (404 Not Found)"]);
});

test("--copy with nothing selected says so and copies nothing", async () => {
	const term = scriptedTerminal({ answers: [[]] });
	await runSearch(term, rows("PROJ-1"), { empty: "none", copy: true }, NOUN, never);

	expect(term.written).toEqual(["Nothing selected."]);
});

test("no rows at all prints the caller's empty message and skips the selection", async () => {
	const term = scriptedTerminal({ answers: [] });
	await runSearch(term, [], { empty: "No matching issues.", copy: true }, NOUN, never);

	expect(term.written).toEqual(["No matching issues."]);
	expect(term.asked).toEqual([]);
});
