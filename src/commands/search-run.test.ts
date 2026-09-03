import kleur from "kleur";
import { expect, test, vi } from "vite-plus/test";

import { alignedRows, printRows } from "#/commands/search-run.ts";

kleur.enabled = false;

const NOW = Date.parse("2026-08-31T10:00:00.000Z");

interface Build {
	number: number;
	status: string;
	createdOn: string;
	branch: string;
}

function build(over: Partial<Build> = {}): Build {
	return {
		number: 124,
		status: "SUCCESSFUL",
		createdOn: "2026-08-30T10:00:00.000Z",
		branch: "main",
		...over,
	};
}

function buildRows(items: Build[]) {
	return alignedRows(items, NOW, (b) => ({
		id: `#${b.number}`,
		url: `https://example.test/${b.number}`,
		label: b.status,
		color: (text: string) => text,
		text: b.branch,
		timestamp: b.createdOn,
	}));
}

function captureLog(fn: () => void): string[] {
	const lines: string[] = [];
	const log = vi
		.spyOn(console, "log")
		.mockImplementation((line: string) => void lines.push(line));
	try {
		fn();
	} finally {
		log.mockRestore();
	}
	return lines;
}

test("alignedRows: the age column reads the timestamp the caller names", () => {
	const rows = buildRows([build(), build({ number: 12, createdOn: "2026-08-31T09:00:00.000Z" })]);
	expect(rows.map((r) => r.fixedColumns)).toEqual([
		"#124  SUCCESSFUL  1d ago",
		"#12   SUCCESSFUL  1h ago",
	]);
});

test("alignedRows: json carries the whole item, not only the cells", () => {
	expect(buildRows([build()])[0]?.json).toEqual(build());
});

test("printRows: json prints the items and no rows", () => {
	const lines = captureLog(() => printRows(buildRows([build()]), { json: true, empty: "none" }));
	expect(JSON.parse(lines.join("\n"))).toEqual([build()]);
});

test("printRows: no rows prints the empty message and no footer", () => {
	expect(captureLog(() => printRows([], { empty: "No builds found.", footer: "more" }))).toEqual([
		"No builds found.",
	]);
});

test("printRows: the footer follows the rows", () => {
	expect(
		captureLog(() => printRows(buildRows([build()]), { empty: "none", footer: "showing 1" })),
	).toEqual(["#124  SUCCESSFUL  1d ago  main", "showing 1"]);
});
