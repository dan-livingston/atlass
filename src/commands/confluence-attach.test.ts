import { expect, test } from "vite-plus/test";

import type { FakeTransport } from "#/test/session.ts";

import { confluenceAttach } from "#/commands/confluence-attach.ts";
import { fakeJiraEnv, routed } from "#/test/env.ts";

const bytes = (text: string) => new TextEncoder().encode(text);

const SEED = { "/work/shot.png": bytes("png"), "/work/report.pdf": bytes("pdf bytes") };

const LISTING = "/wiki/api/v2/pages/123/attachments?limit=250";

function recording(existing: string[] = []): { posts: string[]; spec: FakeTransport } {
	const posts: string[] = [];
	return {
		posts,
		spec: {
			getJson: routed({
				[LISTING]: { results: existing.map((title, i) => ({ id: `att${i}`, title })) },
			}),
			postMultipart: (path, filename, body, extras) => {
				posts.push(
					`POST ${path} ${filename} ${extras?.type} ${JSON.stringify(extras?.fields)}`,
				);
				return {
					results: [
						{
							id: `att-${filename}`,
							title: filename,
							extensions: { fileSize: body.byteLength },
						},
					],
				};
			},
		},
	};
}

test("confluence attach: uploads each file to the page with its media type", async () => {
	const { posts, spec } = recording(["other.png"]);
	const env = fakeJiraEnv(spec, { files: SEED });
	await confluenceAttach(env, "123", ["/work/shot.png", "/work/report.pdf"], {});

	expect(posts).toEqual([
		"POST /wiki/rest/api/content/123/child/attachment shot.png image/png undefined",
		"POST /wiki/rest/api/content/123/child/attachment report.pdf application/pdf undefined",
	]);
	expect(env.term.errors).toEqual(["Uploading shot.png ...", "Uploading report.pdf ..."]);
	expect(env.term.written).toEqual(["Attached shot.png, report.pdf to page 123."]);
});

test("confluence attach: --comment is sent with every file", async () => {
	const { posts, spec } = recording();
	const env = fakeJiraEnv(spec, { files: SEED });
	await confluenceAttach(
		env,
		"https://acme.atlassian.net/wiki/spaces/DEV/pages/123/Notes",
		["/work/shot.png", "/work/report.pdf"],
		{ comment: "from CI" },
	);

	expect(posts.every((p) => p.endsWith('{"comment":"from CI"}'))).toBe(true);
	expect(posts).toHaveLength(2);
});

test("confluence attach: --json prints filename, id and size", async () => {
	const env = fakeJiraEnv(recording().spec, { files: SEED });
	await confluenceAttach(env, "123", ["/work/report.pdf"], { json: true });

	expect(env.term.emitted).toEqual([[{ filename: "report.pdf", id: "att-report.pdf", size: 9 }]]);
});

test("confluence attach: a name already on the page stops the run before anything uploads", async () => {
	const { posts, spec } = recording(["report.pdf"]);
	const env = fakeJiraEnv(spec, { files: SEED });

	await expect(
		confluenceAttach(env, "123", ["/work/shot.png", "/work/report.pdf"], {}),
	).rejects.toThrow("report.pdf already attached to page 123.");
	expect(posts).toEqual([]);
});

test("confluence attach: two files with the same name are refused before anything uploads", async () => {
	const { posts, spec } = recording();
	const env = fakeJiraEnv(spec, {
		files: { ...SEED, "/other/shot.png": bytes("png 2") },
	});

	await expect(
		confluenceAttach(env, "123", ["/work/shot.png", "/other/shot.png"], {}),
	).rejects.toThrow("More than one file is named shot.png.");
	expect(posts).toEqual([]);
});

test("confluence attach: an unreadable file fails before the page is checked", async () => {
	const env = fakeJiraEnv({}, { files: SEED });

	await expect(confluenceAttach(env, "123", ["/work/missing.png"], {})).rejects.toThrow(
		"Cannot read /work/missing.png.",
	);
});
