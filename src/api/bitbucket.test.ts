import { expect, test } from "vite-plus/test";

import type { AtlassianClient } from "#/api/client.ts";

import {
	getPipeline,
	pipelinesQuery,
	pipelineStatus,
	toPipelineSummary,
	wallClockSeconds,
} from "#/api/bitbucket.ts";
import { HttpError } from "#/api/client.ts";

const repo = { workspace: "ws", repo: "app" };

function stubClient(routes: Record<string, unknown>): AtlassianClient {
	return {
		getJson: async (path: string) => {
			if (!(path in routes)) throw new HttpError(404, `Not found (404): ${path}`);
			return routes[path];
		},
	} as unknown as AtlassianClient;
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
