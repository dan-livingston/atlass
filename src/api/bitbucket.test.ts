import { expect, test } from "vite-plus/test";

import { elapsedSeconds, pipelinesQuery, pipelineStatus } from "./bitbucket.ts";

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

test("elapsed: whole seconds between start and completion", () => {
	expect(elapsedSeconds("2026-07-17T12:00:00Z", "2026-07-17T12:01:10Z")).toBe(70);
});

test("elapsed: a missing endpoint has no duration", () => {
	expect(elapsedSeconds("2026-07-17T12:00:00Z", undefined)).toBeNull();
	expect(elapsedSeconds(undefined, undefined)).toBeNull();
});
