import kleur from "kleur";
import { expect, test } from "vite-plus/test";

import { HttpError } from "#/api/http-error.ts";
import { bitbucketPr } from "#/commands/bitbucket-pr.ts";
import { fakeBitbucketEnv } from "#/test/env.ts";

kleur.enabled = false;

const DETAIL = "/2.0/repositories/ws/app/pullrequests/42";
const COMMENTS = `${DETAIL}/comments?pagelen=100&fields=%2Bvalues.resolution.*`;
const DIFFSTAT = `${DETAIL}/diffstat?pagelen=100`;

const PR = {
	id: 42,
	title: "Fix the login redirect loop",
	description: "Stops the bounce between /login and /.",
	state: "OPEN",
	author: { display_name: "Dana Scully", uuid: "{dana}", account_id: "acc-dana" },
	source: { branch: { name: "fix/login" } },
	destination: { branch: { name: "main" } },
	created_on: "2026-08-29T12:00:00Z",
	updated_on: "2026-08-31T10:00:00Z",
	reviewers: [{ display_name: "Fox Mulder", uuid: "{fox}" }],
	participants: [
		{
			user: { display_name: "Fox Mulder", uuid: "{fox}", account_id: "acc-fox" },
			role: "REVIEWER",
			approved: true,
		},
	],
};

const COMMENT_PAGE = {
	size: 2,
	values: [
		{
			id: 1,
			user: { display_name: "Fox Mulder" },
			created_on: "2026-08-30T09:00:00Z",
			content: { raw: "Does this cover the SSO path? cc @{acc-dana}" },
		},
		{
			id: 2,
			user: { display_name: "Gone" },
			created_on: "2026-08-30T10:00:00Z",
			deleted: true,
		},
	],
};

const DIFFSTAT_PAGE = {
	size: 1,
	values: [
		{
			status: "modified",
			lines_added: 9,
			lines_removed: 2,
			new: { path: "src/auth/redirect.ts" },
		},
	],
};

function routes(over: Record<string, unknown> = {}): Record<string, unknown> {
	return { [DETAIL]: PR, [COMMENTS]: COMMENT_PAGE, [DIFFSTAT]: DIFFSTAT_PAGE, ...over };
}

function envFor(over: Record<string, unknown> = {}, defaultRepo = "app") {
	const seen: string[] = [];
	const table = routes(over);
	const env = fakeBitbucketEnv({
		defaultRepo,
		getJson: (path) => {
			seen.push(path);
			if (!(path in table)) throw new HttpError(404, `Not found (404): ${path}`);
			const value = table[path];
			if (value instanceof Error) throw value;
			return value;
		},
	});
	return { env, seen };
}

test("the detail, its comments and its diffstat are fetched and paged as one view", async () => {
	const { env, seen } = envFor();
	await bitbucketPr(env, "42", {});

	expect(seen).toEqual([DETAIL, COMMENTS, DIFFSTAT]);
	const text = env.term.paged[0] ?? "";
	expect(text).toContain("Fix the login redirect loop");
	expect(text).toContain("Branch:     fix/login → main");
	expect(text).toContain("Approvals:  1/1");
	expect(text).toContain("  Fox Mulder  APPROVED");
	expect(text).toContain("Files (1, +9 -2)");
	expect(text).toContain("Does this cover the SSO path?");
});

test("a deleted comment is left out of the count and the body", async () => {
	const { env } = envFor();
	await bitbucketPr(env, "42", {});

	expect(env.term.paged[0]).toContain("Comments (1)");
	expect(env.term.paged[0]).not.toContain("Gone");
});

test("a url argument picks its own repo over the configured default", async () => {
	const other = "/2.0/repositories/acme/web/pullrequests/42";
	const { env, seen } = envFor(
		{
			[other]: PR,
			[`${other}/comments?pagelen=100&fields=%2Bvalues.resolution.*`]: COMMENT_PAGE,
			[`${other}/diffstat?pagelen=100`]: DIFFSTAT_PAGE,
		},
		"app",
	);
	await bitbucketPr(env, "https://bitbucket.org/acme/web/pull-requests/42/diff", {});

	expect(seen[0]).toBe(other);
});

test("--repo still applies when the argument is a bare number", async () => {
	const other = "/2.0/repositories/acme/web/pullrequests/42";
	const { env, seen } = envFor({
		[other]: PR,
		[`${other}/comments?pagelen=100&fields=%2Bvalues.resolution.*`]: COMMENT_PAGE,
		[`${other}/diffstat?pagelen=100`]: DIFFSTAT_PAGE,
	});
	await bitbucketPr(env, "42", { repo: "acme/web" });

	expect(seen[0]).toBe(other);
});

test("a missing pull request names the repo it looked in", async () => {
	const { env } = envFor();
	await expect(bitbucketPr(env, "99", {})).rejects.toThrow(
		"Pull request #99 not found in ws/app.",
	);
});

test("a rejected token points at the pull request scope", async () => {
	const { env } = envFor({ [DETAIL]: new HttpError(403, "Forbidden") });
	await expect(bitbucketPr(env, "42", {})).rejects.toThrow(/read:pullrequest:bitbucket/);
});

test("an argument that is neither a number nor a pull request url is rejected", async () => {
	const { env } = envFor();
	await expect(bitbucketPr(env, "not-a-pr", {})).rejects.toThrow(/Expected a PR number/);
});

test("--json carries the detail, comments, files and the truncation flags", async () => {
	const { env } = envFor();
	await bitbucketPr(env, "42", { json: true });

	expect(env.term.paged).toEqual([]);
	expect(env.term.emitted[0]).toMatchObject({
		id: 42,
		title: "Fix the login redirect loop",
		reviewers: [{ name: "Fox Mulder", state: "APPROVED" }],
		participants: [
			{ accountId: "acc-dana", name: "Dana Scully" },
			{ accountId: "acc-fox", name: "Fox Mulder" },
		],
		comments: [{ id: 1, parentId: null, author: "Fox Mulder", anchor: "", resolved: null }],
		files: [{ path: "src/auth/redirect.ts", added: 9, removed: 2 }],
		truncated: { comments: false, files: false },
	});
});

test("a diffstat the token cannot read leaves the rest of the view standing", async () => {
	const { env } = envFor({ [DIFFSTAT]: new HttpError(403, "Forbidden") });
	await bitbucketPr(env, "42", {});

	const text = env.term.paged[0] ?? "";
	expect(text).toContain("Unavailable: the token needs the read:repository:bitbucket scope.");
	expect(text).toContain("Fix the login redirect loop");
	expect(text).toContain("Does this cover the SSO path?");
});

test("--json reports unreadable files as null rather than an empty list", async () => {
	const { env } = envFor({ [DIFFSTAT]: new HttpError(403, "Forbidden") });
	await bitbucketPr(env, "42", { json: true });

	expect(env.term.emitted[0]).toMatchObject({ files: null });
});
