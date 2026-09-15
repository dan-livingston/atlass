import { join, resolve } from "node:path";
import { expect, test } from "vite-plus/test";

import { confluenceUpdate, copyPage } from "#/commands/confluence.ts";
import { fakeJiraEnv, routed } from "#/test/env.ts";

const dir = resolve("work");
const FILE = join(dir, "123-release-notes.md");

const BODY = {
	type: "doc",
	version: 1,
	content: [
		{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Changes" }] },
		{
			type: "bulletList",
			content: [
				{
					type: "listItem",
					content: [{ type: "paragraph", content: [{ type: "text", text: "Faster" }] }],
				},
			],
		},
		{
			type: "mediaSingle",
			content: [{ type: "media", attrs: { type: "file", id: "f-1", alt: "diagram.png" } }],
		},
		{ type: "paragraph", content: [{ type: "text", text: "Thanks." }] },
	],
};

const PAGE = "/wiki/api/v2/pages/123?body-format=atlas_doc_format";

function pageEnv() {
	return fakeJiraEnv({
		getJson: routed({
			[PAGE]: {
				id: "123",
				title: "Release Notes",
				spaceId: "S1",
				version: { number: 4 },
				body: { atlas_doc_format: { value: JSON.stringify(BODY) } },
			},
			"/wiki/api/v2/spaces/S1": { key: "DEV" },
			"/wiki/api/v2/pages/123/attachments?limit=250": {
				results: [
					{
						id: "a-1",
						fileId: "f-1",
						title: "diagram.png",
						fileSize: 3,
						downloadLink: "/download/a-1",
					},
				],
			},
			"/wiki/api/v2/pages/123/footer-comments?body-format=atlas_doc_format&limit=250": {
				results: [],
			},
		}),
		getBinary: () => new TextEncoder().encode("png"),
	});
}

test("a fresh copy dry-runs with no diff at all", async () => {
	const env = pageEnv();
	await copyPage(env, "123", dir);
	await confluenceUpdate(env, FILE, { dryRun: true });

	expect(env.term.written.at(-1)).toBe(
		[
			'Dry run for page 123 "Release Notes"',
			"  images:  1 reused",
			"  nothing was written (dry run)",
		].join("\n"),
	);
});

test("an edit to a copy dry-runs as a diff of just that line", async () => {
	const env = pageEnv();
	await copyPage(env, "123", dir);
	const text = await env.files.readText(FILE);
	await env.files.writeText(FILE, text.replace("Thanks.", "Thanks, all."));
	await confluenceUpdate(env, FILE, { dryRun: true });

	expect(env.term.written.at(-1)).toContain(
		["-Thanks.", "+Thanks, all.", "  nothing was written (dry run)"].join("\n"),
	);
});
