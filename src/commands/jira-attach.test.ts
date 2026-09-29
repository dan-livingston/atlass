import { expect, test } from "vite-plus/test";

import type { FakeTransport } from "#/test/session.ts";

import { mediaType } from "#/api/media-type.ts";
import { jiraAttach } from "#/commands/jira-attach.ts";
import { fakeJiraEnv } from "#/test/env.ts";

const bytes = (text: string) => new TextEncoder().encode(text);

const SEED = { "/work/shot.png": bytes("png"), "/work/notes.txt": bytes("hello") };

function recording(fail?: string): { posts: string[]; spec: FakeTransport } {
	const posts: string[] = [];
	return {
		posts,
		spec: {
			postMultipart: (path, filename, body, extras) => {
				if (filename === fail)
					throw new Error("the page or an attachment exceeds the size limit");
				posts.push(`POST ${path} ${filename} ${extras?.type}`);
				return [{ id: `id-${filename}`, filename, size: body.byteLength }];
			},
		},
	};
}

test("jira attach: uploads each file in order with its media type", async () => {
	const { posts, spec } = recording();
	const env = fakeJiraEnv(spec, { files: SEED });
	await jiraAttach(env, "proj-7", ["/work/shot.png", "/work/notes.txt"], {});

	expect(posts).toEqual([
		"POST /rest/api/3/issue/PROJ-7/attachments shot.png image/png",
		"POST /rest/api/3/issue/PROJ-7/attachments notes.txt text/plain",
	]);
	expect(env.term.errors).toEqual(["Uploading shot.png ...", "Uploading notes.txt ..."]);
	expect(env.term.written).toEqual(["Attached shot.png, notes.txt to PROJ-7."]);
});

test("jira attach: takes an issue URL", async () => {
	const { posts, spec } = recording();
	const env = fakeJiraEnv(spec, { files: SEED });
	await jiraAttach(env, "https://acme.atlassian.net/browse/PROJ-7", ["/work/shot.png"], {});

	expect(posts).toEqual(["POST /rest/api/3/issue/PROJ-7/attachments shot.png image/png"]);
});

test("jira attach: --json prints filename, id and size", async () => {
	const env = fakeJiraEnv(recording().spec, { files: SEED });
	await jiraAttach(env, "PROJ-7", ["/work/notes.txt"], { json: true });

	expect(env.term.emitted).toEqual([[{ filename: "notes.txt", id: "id-notes.txt", size: 5 }]]);
	expect(env.term.written).toEqual([]);
});

test("jira attach: an unreadable file stops the run before anything uploads", async () => {
	const { posts, spec } = recording();
	const env = fakeJiraEnv(spec, { files: SEED });

	await expect(
		jiraAttach(env, "PROJ-7", ["/work/shot.png", "/work/missing.pdf", "/work/gone.txt"], {}),
	).rejects.toThrow("Cannot read /work/missing.pdf, /work/gone.txt.");
	expect(posts).toEqual([]);
});

test("jira attach: a failed upload stops the run and names what already went up", async () => {
	const { posts, spec } = recording("notes.txt");
	const env = fakeJiraEnv(spec, {
		files: { ...SEED, "/work/later.png": bytes("png") },
	});

	await expect(
		jiraAttach(env, "PROJ-7", ["/work/shot.png", "/work/notes.txt", "/work/later.png"], {}),
	).rejects.toThrow("size limit");
	expect(posts).toEqual(["POST /rest/api/3/issue/PROJ-7/attachments shot.png image/png"]);
	expect(env.term.errors).toContain("Already attached to PROJ-7: shot.png.");
});

test("jira attach: a bad issue reference fails before reading files", async () => {
	const env = fakeJiraEnv(recording().spec);

	await expect(jiraAttach(env, "nope", ["/work/missing.png"], {})).rejects.toThrow(
		'Could not find an issue key in "nope"',
	);
});

test("media type: known extensions map regardless of case, unknown ones are left to the server", () => {
	expect(mediaType("Diagram.PNG")).toBe("image/png");
	expect(mediaType("report.pdf")).toBe("application/pdf");
	expect(mediaType("archive.7z")).toBeUndefined();
	expect(mediaType("Makefile")).toBeUndefined();
});
