import { expect, test } from "vite-plus/test";

import { formatPageRows } from "#/commands/confluence.ts";

test("pages: id and space columns are padded so titles align", () => {
	const rows = formatPageRows([
		{ id: "1347354627", space: "DOCS", title: "Green Bar", url: "https://x/1" },
		{ id: "931692546", space: "ENGINEERING", title: "Build Workflow", url: "https://x/2" },
	]);
	expect(rows.map((r) => r.fixedColumns)).toEqual([
		"1347354627  DOCS       ",
		"931692546   ENGINEERING",
	]);
	expect(rows.map((r) => r.freeText)).toEqual(["Green Bar", "Build Workflow"]);
	expect(rows.map((r) => r.id)).toEqual(["1347354627", "931692546"]);
	expect(rows[0]?.json).toEqual({
		id: "1347354627",
		space: "DOCS",
		title: "Green Bar",
		url: "https://x/1",
	});
});
