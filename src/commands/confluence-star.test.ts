import { join, resolve } from "node:path";
import { expect, test } from "vite-plus/test";

import { confluenceStar, confluenceUnstar } from "#/commands/confluence-star.ts";
import { fakeJiraEnv } from "#/test/env.ts";

const FAVOURITE = "/wiki/rest/api/relation/favourite/from/user/current/to/content/123";

test("star takes a page id and reports it", async () => {
	const calls: string[] = [];
	const env = fakeJiraEnv({ putNoContent: (path) => void calls.push(`PUT ${path}`) });
	await confluenceStar(env, "123");

	expect(calls).toEqual([`PUT ${FAVOURITE}`]);
	expect(env.term.written).toEqual(["Starred page 123."]);
});

test("star takes a page URL", async () => {
	const calls: string[] = [];
	const env = fakeJiraEnv({ putNoContent: (path) => void calls.push(path) });
	await confluenceStar(env, "https://acme.atlassian.net/wiki/spaces/DEV/pages/123/Title");

	expect(calls).toEqual([FAVOURITE]);
});

test("unstar takes a copied file and reads the id from its frontmatter", async () => {
	const file = join(resolve("work"), "page.md");
	const calls: string[] = [];
	const env = fakeJiraEnv(
		{ deleteNoContent: (path) => void calls.push(`DELETE ${path}`) },
		{ files: { [file]: '---\nid: "123"\nversion: 4\n---\n\n# Title\n' } },
	);
	await confluenceUnstar(env, file);

	expect(calls).toEqual([`DELETE ${FAVOURITE}`]);
	expect(env.term.written).toEqual(["Unstarred page 123."]);
});

test("star refuses a file with no page id", async () => {
	const file = join(resolve("work"), "draft.md");
	const env = fakeJiraEnv({}, { files: { [file]: '---\ntitle: "Draft"\n---\n\n# Draft\n' } });

	await expect(confluenceStar(env, file)).rejects.toThrow(
		`${file} has no page \`id\` in its frontmatter.`,
	);
});

test("star without a page and without a terminal names the missing argument", async () => {
	await expect(confluenceStar(fakeJiraEnv(), undefined)).rejects.toThrow(
		"Cannot prompt without a terminal. Pass [page].",
	);
});
