import { join, resolve } from "node:path";
import { expect, test } from "vite-plus/test";

import type { FileSeed } from "#/files/memory.ts";
import type { FakeTransport } from "#/test/session.ts";

import { confluenceCreate } from "#/commands/confluence-create.ts";
import { fakeJiraEnv } from "#/test/env.ts";

const dir = resolve("work");
const FILE = join(dir, "notes.md");
const SITE = "https://acme.atlassian.net";
const FAVOURITE = "/wiki/rest/api/relation/favourite/from/user/current/to/content/900";

function created(version: number) {
	return {
		"/wiki/api/v2/spaces?keys=DEV": { results: [{ id: "S1", key: "DEV" }] },
		"/wiki/api/v2/pages/900?body-format=atlas_doc_format": {
			id: "900",
			title: "Notes",
			spaceId: "S1",
			createdAt: "2026-09-15T01:00:00.000Z",
			version: { number: version, createdAt: "2026-09-15T01:00:05.000Z", authorId: "u1" },
			_links: { webui: "/spaces/DEV/pages/900/Notes" },
		},
		"/wiki/api/v2/spaces/S1": { key: "DEV" },
		"/wiki/api/v2/pages/900/attachments?limit=250": { results: [] },
		"/wiki/api/v2/pages/900/footer-comments?body-format=atlas_doc_format&limit=250": {
			results: [],
		},
		"/wiki/rest/api/user?accountId=u1": { displayName: "Ada" },
	} as Record<string, unknown>;
}

function createEnv(files: FileSeed, spec: FakeTransport = {}, json = created(1)) {
	const calls: string[] = [];
	const bodies: unknown[] = [];
	const env = fakeJiraEnv(
		{
			site: SITE,
			getJson: (path) => {
				if (!(path in json)) throw new Error(`unexpected GET ${path}`);
				return json[path];
			},
			postJson: (path, body) => {
				calls.push(`POST ${path}`);
				bodies.push(body);
				return { id: "900", version: { number: 1 } };
			},
			...spec,
		},
		{ files },
	);
	return { env, calls, bodies };
}

const COPIED_FIELDS = [
	'title: "Notes"',
	'id: "900"',
	'space: "DEV"',
	"version: 1",
	'author: "Ada"',
	'created: "2026-09-15T01:00:00.000Z"',
	'updated: "2026-09-15T01:00:05.000Z"',
	`url: "${SITE}/wiki/spaces/DEV/pages/900/Notes"`,
];

test("create publishes plain Markdown and gives the file a copy's frontmatter", async () => {
	const { env, calls, bodies } = createEnv({ [FILE]: "# Notes\n\nHello.\n" });
	await confluenceCreate(env, FILE, { space: "DEV" });

	expect(calls).toEqual(["POST /wiki/api/v2/pages"]);
	expect(bodies[0]).toEqual({
		spaceId: "S1",
		status: "current",
		title: "Notes",
		body: {
			representation: "atlas_doc_format",
			value: JSON.stringify({
				type: "doc",
				version: 1,
				content: [{ type: "paragraph", content: [{ type: "text", text: "Hello." }] }],
			}),
		},
	});
	expect(await env.files.readText(FILE)).toBe(
		[
			"---",
			...COPIED_FIELDS,
			"---",
			"",
			"# Notes",
			"",
			"Hello.",
			"",
			"<!-- atlass:generated -->",
			"",
		].join("\n"),
	);
	expect(env.term.written).toEqual([
		`Created page 900 in DEV: ${SITE}/wiki/spaces/DEV/pages/900/Notes`,
	]);
});

test("create reads the space from frontmatter, keeps other keys, and passes the parent", async () => {
	const text = ["---", 'space: "DEV"', 'owner: "docs team"', "---", "", "# Notes", "", "Hi.", ""];
	const { env, bodies } = createEnv({ [FILE]: text.join("\r\n") });
	await confluenceCreate(env, FILE, { parent: `${SITE}/wiki/spaces/DEV/pages/42/Home` });

	expect(bodies[0]).toMatchObject({ spaceId: "S1", parentId: "42" });
	const written = await env.files.readText(FILE);
	expect(written.startsWith('---\r\nspace: "DEV"\r\nowner: "docs team"\r\ntitle: "Notes"')).toBe(
		true,
	);
	expect(written.endsWith("Hi.\r\n\r\n<!-- atlass:generated -->\r\n")).toBe(true);
});

test("create with a local image creates, records the id, uploads, then pushes v2", async () => {
	const order: string[] = [];
	const { env } = createEnv(
		{ [FILE]: "# Notes\n\nSee ![flow](img/flow.png)\n", [join(dir, "img", "flow.png")]: "png" },
		{
			postJson: async (path) => {
				order.push(`POST ${path}`);
				return { id: "900", version: { number: 1 } };
			},
			postMultipart: async (path, filename) => {
				order.push(`POST ${path} ${filename}`);
				expect(await env.files.readText(FILE)).toContain('id: "900"');
				return { results: [{ extensions: { fileId: "file-1" } }] };
			},
			putJson: (path, body) => {
				order.push(
					`PUT ${path} v${(body as { version: { number: number } }).version.number}`,
				);
				return { version: { number: 2 } };
			},
		},
		created(2),
	);
	await confluenceCreate(env, FILE, { space: "DEV" });

	expect(order).toEqual([
		"POST /wiki/api/v2/pages",
		"POST /wiki/rest/api/content/900/child/attachment flow.png",
		"PUT /wiki/api/v2/pages/900 v2",
	]);
	expect(await env.files.readText(FILE)).toContain("version: 2");
});

test("create --star stars the new page", async () => {
	const starred: string[] = [];
	const { env } = createEnv(
		{ [FILE]: "# Notes\n\nHello.\n" },
		{ putNoContent: (path) => void starred.push(path) },
	);
	await confluenceCreate(env, FILE, { space: "DEV", star: true });

	expect(starred).toEqual([FAVOURITE]);
	expect(env.term.written.at(-1)).toBe("Starred page 900.");
});

test("create --star that fails keeps the page and file, and says how to finish", async () => {
	const { env } = createEnv(
		{ [FILE]: "# Notes\n\nHello.\n" },
		{
			putNoContent: () => {
				throw new Error("Forbidden (403)");
			},
		},
	);
	await expect(confluenceCreate(env, FILE, { space: "DEV", star: true })).rejects.toThrow(
		`Created page 900 but could not star it: Forbidden (403). Run \`atlass confluence star ${FILE}\`.`,
	);
	expect(await env.files.readText(FILE)).toContain('id: "900"');
});

test("create --dry-run prints the plan and writes nothing", async () => {
	const { env, calls } = createEnv({
		[FILE]: "# Notes\n\nSee <b>this</b> ![x](https://cdn/x.png)\n",
	});
	await confluenceCreate(env, FILE, { space: "DEV", dryRun: true });

	expect(calls).toEqual([]);
	expect(env.term.written).toEqual([
		[
			'Dry run for new page "Notes"',
			"  space:   DEV",
			"  parent:  space homepage",
			"  images:  1 external",
			"  warning: 2 inline HTML tags will be sent as text",
			"  nothing was written (dry run)",
		].join("\n"),
	]);
});

test("create --dry-run lists every refusal and fails", async () => {
	const { env } = createEnv({ [FILE]: "Body only ![gone](gone.png)\n" });
	await expect(confluenceCreate(env, FILE, { dryRun: true })).rejects.toThrow(
		"No title. Add an H1 or a `title` to the frontmatter.\n" +
			"No space. Pass --space or add `space` to the frontmatter.\n" +
			"Image file(s) not found: gone.png",
	);
	expect(env.term.written[0]).toContain("  blocked: Image file(s) not found: gone.png");
});

test("create refuses an unknown space before writing anything", async () => {
	const { env, calls } = createEnv(
		{ [FILE]: "# Notes\n" },
		{},
		{ "/wiki/api/v2/spaces?keys=NOPE": { results: [] } },
	);
	await expect(confluenceCreate(env, FILE, { space: "NOPE" })).rejects.toThrow(
		'Space "NOPE" not found.',
	);
	expect(calls).toEqual([]);
});

test("create refuses a file that already has a page id", async () => {
	const { env } = createEnv({ [FILE]: '---\nid: "5"\nversion: 2\n---\n\n# Notes\n' });
	await expect(confluenceCreate(env, FILE, { space: "DEV" })).rejects.toThrow(
		`${FILE} already has page id 5. Use \`atlass confluence update\` instead.`,
	);
});
