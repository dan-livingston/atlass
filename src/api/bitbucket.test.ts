import { expect, test } from "vite-plus/test";

import {
	getPipeline,
	pipelinesQuery,
	pipelineStatus,
	toPipelineSummary,
	wallClockSeconds,
} from "#/api/bitbucket-pipelines.ts";
import { toChangedFile, toComment, toPullRequestDetail } from "#/api/bitbucket-pr-detail.ts";
import {
	listPullRequests,
	parsePullRequestStates,
	pullRequestQuery,
	pullRequestsQuery,
	toPullRequestSummary,
} from "#/api/bitbucket-pull-requests.ts";
import { HttpError } from "#/api/http-error.ts";
import { fakeBitbucketSession } from "#/test/session.ts";

const repo = { workspace: "ws", repo: "app" };

function stubClient(routes: Record<string, unknown>) {
	return fakeBitbucketSession({
		getJson: (path) => {
			if (!(path in routes)) throw new HttpError(404, `Not found (404): ${path}`);
			return routes[path];
		},
	});
}

test("status: a completed pipeline shows its result", () => {
	expect(pipelineStatus({ name: "COMPLETED", result: { name: "SUCCESSFUL" } })).toBe(
		"SUCCESSFUL",
	);
	expect(pipelineStatus({ name: "COMPLETED", result: { name: "FAILED" } })).toBe("FAILED");
});

test("status: a non-completed pipeline shows its state name", () => {
	expect(pipelineStatus({ name: "IN_PROGRESS" })).toBe("IN_PROGRESS");
	expect(pipelineStatus({ name: "PENDING" })).toBe("PENDING");
});

test("status: a completed pipeline with no result falls back to COMPLETED", () => {
	expect(pipelineStatus({ name: "COMPLETED" })).toBe("COMPLETED");
});

test("status: missing state is empty", () => {
	expect(pipelineStatus(undefined)).toBe("");
});

test("pipelinesQuery: newest first, pagelen clamped to the limit up to 100", () => {
	expect(pipelinesQuery(25)).toBe("sort=-created_on&pagelen=25");
	expect(pipelinesQuery(250)).toBe("sort=-created_on&pagelen=100");
});

test("wallClockSeconds: whole seconds between start and completion", () => {
	expect(wallClockSeconds("2026-07-17T12:00:00Z", "2026-07-17T12:01:10Z")).toBe(70);
});

test("wallClockSeconds: a missing endpoint has no duration", () => {
	expect(wallClockSeconds("2026-07-17T12:00:00Z", undefined)).toBeNull();
	expect(wallClockSeconds(undefined, undefined)).toBeNull();
});

test("summary: duration is wall clock, not build_seconds_used, which is 0 on self-hosted runners", () => {
	const value = {
		uuid: "{u}",
		build_number: 7,
		build_seconds_used: 0,
		created_on: "2026-07-17T12:00:00Z",
		completed_on: "2026-07-17T12:01:10Z",
	};
	expect(toPipelineSummary(repo, value).durationSeconds).toBe(70);
});

test("summary: commit is the short hash", () => {
	const value = {
		uuid: "{u}",
		build_number: 7,
		target: { commit: { hash: "0123456789abcdef" } },
	};
	expect(toPipelineSummary(repo, value).commit).toBe("0123456");
});

test("getPipeline: the build number is accepted directly in place of the uuid", async () => {
	const client = stubClient({
		"/2.0/repositories/ws/app/pipelines/7": { uuid: "{u7}", build_number: 7 },
	});
	expect((await getPipeline(client, repo, 7)).uuid).toBe("{u7}");
});

test("getPipeline: falls back to scanning recent runs when the direct path is rejected", async () => {
	const client = stubClient({
		"/2.0/repositories/ws/app/pipelines?sort=-created_on&pagelen=100": {
			values: [{ uuid: "{u9}", build_number: 9 }],
			next: "https://api.bitbucket.org/2.0/repositories/ws/app/pipelines?sort=-created_on&pagelen=100&page=2",
		},
		"/2.0/repositories/ws/app/pipelines?sort=-created_on&pagelen=100&page=2": {
			values: [{ uuid: "{u7}", build_number: 7 }],
		},
	});
	expect((await getPipeline(client, repo, 7)).uuid).toBe("{u7}");
});

test("getPipeline: a build older than the scan limit is reported, not searched forever", async () => {
	const path = "/2.0/repositories/ws/app/pipelines?sort=-created_on&pagelen=100";
	const client = stubClient({
		[path]: {
			values: [{ uuid: "{u9}", build_number: 9 }],
			next: `https://api.bitbucket.org${path}`,
		},
	});
	await expect(getPipeline(client, repo, 7)).rejects.toThrow("1000 most recent runs");
});

const UUID = "{cc8e193d-1111-2222-3333-444455556666}";

test("pr states: values are uppercased, split on commas, and deduped", () => {
	expect(parsePullRequestStates(["open,merged", "OPEN"])).toEqual(["OPEN", "MERGED"]);
});

test("pr states: no flag means no state param, so the server's open default stands", () => {
	expect(parsePullRequestStates(undefined)).toEqual([]);
});

test("pr states: an unknown state is rejected, since the api would silently return every pr", () => {
	expect(() => parsePullRequestStates(["closed"])).toThrow(
		'Invalid --state "closed". Expected open, merged, declined, or superseded.',
	);
});

test("pr query: an author uuid filters on author.uuid", () => {
	expect(pullRequestQuery({ author: UUID })).toBe(`author.uuid = "${UUID}"`);
});

test("pr query: an account id filters on account_id instead", () => {
	expect(pullRequestQuery({ author: "557058:0d1b2c3d-4e5f-6789-abcd-ef0123456789" })).toBe(
		'author.account_id = "557058:0d1b2c3d-4e5f-6789-abcd-ef0123456789"',
	);
	expect(pullRequestQuery({ author: "5b10a2844c20165700ede21b" })).toBe(
		'author.account_id = "5b10a2844c20165700ede21b"',
	);
});

test("pr query: author and reviewer are ored, so both mean anything involving them", () => {
	expect(pullRequestQuery({ author: UUID, reviewer: UUID })).toBe(
		`(author.uuid = "${UUID}" OR reviewers.uuid = "${UUID}")`,
	);
});

test("pr query: a reviewer alone filters on reviewers", () => {
	expect(pullRequestQuery({ reviewer: UUID })).toBe(`reviewers.uuid = "${UUID}"`);
});

test("pr query: a name is rejected rather than sent as a query that matches nothing", () => {
	expect(() => pullRequestQuery({ author: "Dana Scully" })).toThrow(
		'Invalid --author "Dana Scully". Expected me, an account id, or a uuid in braces.',
	);
});

test("pr query: shapes that only look like an account id are rejected, not sent", () => {
	for (const value of [
		"a:b",
		"danascullythelongestusername",
		"cc8e193d-1111-2222-3333-444455556666",
	]) {
		expect(() => pullRequestQuery({ reviewer: value })).toThrow("Invalid --reviewer");
	}
});

test("pr query: no filters means no query at all", () => {
	expect(pullRequestQuery({})).toBeUndefined();
});

test("pr query: a raw query is passed through", () => {
	expect(pullRequestQuery({ query: 'title ~ "login"' })).toBe('title ~ "login"');
});

test("pr query: a raw query naming state is rejected, since it would fight --state", () => {
	expect(() => pullRequestQuery({ query: 'state = "MERGED"' })).toThrow(
		"--query cannot mention state; use --state instead.",
	);
	expect(pullRequestQuery({ query: 'title ~ "restate"' })).toBe('title ~ "restate"');
});

test("pullRequestsQuery: newest updated first, pagelen clamped, states repeated", () => {
	expect(pullRequestsQuery({ limit: 25, states: [] })).toBe("sort=-updated_on&pagelen=25");
	expect(pullRequestsQuery({ limit: 250, states: ["OPEN", "MERGED"] })).toBe(
		"sort=-updated_on&pagelen=100&state=OPEN&state=MERGED",
	);
});

test("pullRequestsQuery: the bbql query rides along encoded", () => {
	expect(pullRequestsQuery({ limit: 1, states: [], query: 'author.uuid = "{u}"' })).toBe(
		"sort=-updated_on&pagelen=1&q=author.uuid+%3D+%22%7Bu%7D%22",
	);
});

test("pr summary: the row fields come from the list response and the url is built from the ref", () => {
	const value = {
		id: 42,
		title: "Fix the login redirect loop",
		state: "OPEN",
		draft: false,
		created_on: "2026-08-30T10:00:00Z",
		updated_on: "2026-08-31T09:00:00Z",
		comment_count: 3,
		author: { display_name: "Dana Scully", uuid: UUID },
		source: { branch: { name: "fix/login" } },
		destination: { branch: { name: "main" } },
	};
	expect(toPullRequestSummary(repo, value)).toEqual({
		id: 42,
		title: "Fix the login redirect loop",
		state: "OPEN",
		draft: false,
		author: "Dana Scully",
		authorUuid: UUID,
		sourceBranch: "fix/login",
		destinationBranch: "main",
		commentCount: 3,
		createdOn: "2026-08-30T10:00:00Z",
		updatedOn: "2026-08-31T09:00:00Z",
		url: "https://bitbucket.org/ws/app/pull-requests/42",
	});
});

test("pr summary: a sparse response degrades to empty fields rather than undefined", () => {
	expect(toPullRequestSummary(repo, { id: 7 })).toMatchObject({
		title: "",
		state: "",
		draft: false,
		author: "",
		sourceBranch: "",
		commentCount: 0,
	});
});

test("listPullRequests: stops at the limit rather than walking every page", async () => {
	const path = "/2.0/repositories/ws/app/pullrequests?sort=-updated_on&pagelen=2";
	const client = stubClient({
		[path]: {
			values: [{ id: 1 }, { id: 2 }],
			next: `https://api.bitbucket.org${path}&page=2`,
		},
	});
	const prs = await listPullRequests(client, repo, { limit: 2, states: [] });
	expect(prs.map((pr) => pr.id)).toEqual([1, 2]);
});

test("pr detail: a requested reviewer with no verdict yet is listed as pending", () => {
	const detail = toPullRequestDetail(repo, {
		id: 7,
		reviewers: [
			{ display_name: "Fox", uuid: "{fox}" },
			{ display_name: "Dana", uuid: "{dana}" },
		],
		participants: [
			{ user: { display_name: "Fox", uuid: "{fox}" }, role: "REVIEWER", approved: true },
		],
	});
	expect(detail.reviewers).toEqual([
		{ name: "Fox", state: "APPROVED" },
		{ name: "Dana", state: "" },
	]);
});

test("pr detail: an explicit participant state wins over the approved flag", () => {
	const detail = toPullRequestDetail(repo, {
		id: 7,
		participants: [
			{
				user: { display_name: "Dana", uuid: "{dana}" },
				role: "REVIEWER",
				approved: false,
				state: "changes_requested",
			},
		],
	});
	expect(detail.reviewers).toEqual([{ name: "Dana", state: "CHANGES_REQUESTED" }]);
});

test("pr detail: someone who approved without being asked still counts", () => {
	const detail = toPullRequestDetail(repo, {
		id: 7,
		participants: [
			{ user: { display_name: "Walter", uuid: "{w}" }, role: "PARTICIPANT", approved: true },
			{ user: { display_name: "Byers", uuid: "{b}" }, role: "PARTICIPANT", approved: false },
		],
	});
	expect(detail.reviewers).toEqual([{ name: "Walter", state: "APPROVED" }]);
});

test("pr comments: deleted and empty ones are dropped", () => {
	expect(toComment({ deleted: true, content: { raw: "gone" } })).toBeNull();
	expect(toComment({ content: { raw: "   " } })).toBeNull();
});

test("pr comments: an inline comment is anchored, a general one is not", () => {
	expect(toComment({ content: { raw: "hi" }, inline: { path: "a.ts", to: 12 } })?.anchor).toBe(
		"a.ts:12",
	);
	expect(
		toComment({ content: { raw: "hi" }, inline: { path: "a.ts", to: null, from: 3 } })?.anchor,
	).toBe("a.ts:3");
	expect(toComment({ content: { raw: "hi" }, inline: { path: "a.ts" } })?.anchor).toBe("a.ts");
	expect(toComment({ content: { raw: "hi" } })?.anchor).toBe("");
});

test("pr files: a rename shows both paths, a delete keeps the old one", () => {
	expect(
		toChangedFile({ status: "renamed", old: { path: "a.ts" }, new: { path: "b.ts" } }).path,
	).toBe("a.ts -> b.ts");
	expect(toChangedFile({ status: "removed", old: { path: "a.ts" }, new: null }).path).toBe(
		"a.ts",
	);
});
