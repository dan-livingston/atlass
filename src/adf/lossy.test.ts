import { expect, test } from "vite-plus/test";

import { findLossyNodes, formatLossy, JIRA_LOSSY_LABELS } from "#/adf/lossy.ts";

test("finds and labels lossy nodes", () => {
	const body = {
		type: "doc",
		content: [
			{ type: "panel", content: [{ type: "paragraph" }] },
			{ type: "extension" },
			{ type: "bodiedExtension", content: [{ type: "nestedExpand" }] },
		],
	};
	const counts = findLossyNodes(body);
	expect(counts.get("panel")).toBe(1);
	expect(counts.get("macro")).toBe(2);
	expect(counts.get("expand")).toBe(1);
	expect(formatLossy(counts)).toBe("1 panel, 2 macros, 1 expand");
});

test("no lossy nodes yields an empty map", () => {
	const body = { type: "doc", content: [{ type: "paragraph" }] };
	expect(findLossyNodes(body).size).toBe(0);
});

test("jira lossy set counts leaf media as images, since jira update does not re-upload them", () => {
	const body = {
		type: "doc",
		content: [
			{ type: "mediaSingle", content: [{ type: "media" }] },
			{ type: "panel", content: [{ type: "paragraph" }] },
			{ type: "paragraph", content: [{ type: "mediaInline" }] },
		],
	};
	const counts = findLossyNodes(body, JIRA_LOSSY_LABELS);
	expect(counts.get("image")).toBe(2);
	expect(counts.get("panel")).toBe(1);
});

test("default lossy set does not flag media", () => {
	const body = { type: "doc", content: [{ type: "mediaSingle", content: [{ type: "media" }] }] };
	expect(findLossyNodes(body).size).toBe(0);
});
