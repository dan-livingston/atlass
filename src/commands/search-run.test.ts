import kleur from "kleur";
import { expect, test } from "vite-plus/test";

import { alignedRows, formatRows } from "#/commands/search-run.ts";

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

test("formatRows: no rows gives the empty message and no footer", () => {
	expect(formatRows([], { empty: "No builds found.", footer: "more", width: 80 })).toEqual([
		"No builds found.",
	]);
});

test("formatRows: the footer follows the rows", () => {
	expect(
		formatRows(buildRows([build()]), { empty: "none", footer: "showing 1", width: 80 }),
	).toEqual(["#124  SUCCESSFUL  1d ago  main", "showing 1"]);
});
