import { expect, test } from "vite-plus/test";

import { formatProjectRows } from "./jira.ts";

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
