import kleur from "kleur";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vite-plus/test";

import { confluenceCopy, confluenceView } from "#/commands/confluence.ts";
import { fakeEnv, routed } from "#/test/env.ts";

kleur.enabled = false;

let dir: string;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "atlass-conf-view-"));
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

const PAGE = {
	"/wiki/api/v2/pages/123?body-format=atlas_doc_format": {
		id: "123",
		title: "Release Notes",
		spaceId: "9",
		version: { number: 4, createdAt: "2026-08-30T10:00:00.000Z", authorId: "u1" },
		body: {
			atlas_doc_format: {
				value: JSON.stringify({
					type: "doc",
					version: 1,
					content: [
						{ type: "paragraph", content: [{ type: "text", text: "All good." }] },
					],
				}),
			},
		},
	},
	"/wiki/api/v2/spaces/9": { key: "DEV" },
	"/wiki/api/v2/pages/123/footer-comments?body-format=atlas_doc_format&limit=250": {
		results: [],
	},
	"/wiki/api/v2/pages/123/attachments?limit=250": { results: [] },
	"/wiki/rest/api/user?accountId=u1": { displayName: "Ada" },
};

test("confluence view: the page is paged, never written line by line", async () => {
	const env = fakeEnv({ getJson: routed(PAGE) });
	await confluenceView(env, "123", {});

	expect(env.term.written).toEqual([]);
	expect(env.term.paged).toHaveLength(1);
	expect(env.term.paged[0]).toContain("Release Notes");
	expect(env.term.paged[0]).toContain("Space:    DEV");
	expect(env.term.paged[0]).toContain("All good.");
});

test("confluence view: --no-pager still reaches page, which decides not to spawn one", async () => {
	const env = fakeEnv({ getJson: routed(PAGE) });
	await confluenceView(env, "123", { pager: false });

	expect(env.term.paged).toHaveLength(1);
});

test("confluence view: a reference the parser rejects never reaches the api", async () => {
	const env = fakeEnv();
	await expect(confluenceView(env, "not-a-page", {})).rejects.toThrow(
		'Could not find a page id in "not-a-page".',
	);
});

test("confluence view: with no argument and no terminal, it names the missing argument", async () => {
	const env = fakeEnv();
	await expect(confluenceView(env, undefined, {})).rejects.toThrow(
		"Cannot prompt without a terminal. Pass [page].",
	);
});

test("confluence copy: the document is written and progress goes to stderr", async () => {
	const env = fakeEnv({ getJson: routed(PAGE) });
	await confluenceCopy(env, "123", { out: dir });

	expect(await readdir(dir)).toEqual(["123-release-notes.md"]);
	expect(await readFile(join(dir, "123-release-notes.md"), "utf8")).toContain("All good.");
	expect(env.term.errors).toEqual(["Fetching page 123 ..."]);
	expect(env.term.written).toEqual([`Wrote ${join(dir, "123-release-notes.md")}`]);
});
