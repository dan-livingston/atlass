import { expect, test } from "vite-plus/test";

import type { PipelineSummary, StepSummary } from "../api/bitbucket.ts";

import { formatPipelineRows, formatStepRows } from "./bitbucket.ts";

const NOW = Date.parse("2026-07-17T12:00:00Z");

function pipeline(over: Partial<PipelineSummary>): PipelineSummary {
	return {
		buildNumber: 1,
		status: "SUCCESSFUL",
		ref: "main",
		durationSeconds: 154,
		createdOn: "2026-07-14T12:00:00Z",
		creator: "Dana Scully",
		uuid: "{u}",
		...over,
	};
}

test("pipeline rows: columns align across build number, status, ref, duration, age", () => {
	expect(
		formatPipelineRows(
			[
				pipeline({
					buildNumber: 124,
					status: "SUCCESSFUL",
					ref: "main",
					durationSeconds: 154,
				}),
				pipeline({
					buildNumber: 12,
					status: "FAILED",
					ref: "feat/login",
					durationSeconds: 62,
					creator: "Fox Mulder",
				}),
			],
			NOW,
		),
	).toEqual([
		"#124  SUCCESSFUL  main        2m34s  3d ago  Dana Scully",
		"#12   FAILED      feat/login  1m02s  3d ago  Fox Mulder",
	]);
});

test("pipeline rows: a running build has no duration and empty fields dash", () => {
	expect(
		formatPipelineRows(
			[
				pipeline({
					buildNumber: 5,
					status: "IN_PROGRESS",
					durationSeconds: null,
					creator: "",
				}),
			],
			NOW,
		),
	).toEqual(["#5  IN_PROGRESS  main  -  3d ago  -"]);
});

function step(over: Partial<StepSummary>): StepSummary {
	return { name: "Build", status: "SUCCESSFUL", durationSeconds: 70, ...over };
}

test("step rows: indented, name and status columns align", () => {
	expect(
		formatStepRows([
			step({ name: "Build", durationSeconds: 70 }),
			step({ name: "Deploy", status: "FAILED", durationSeconds: 5 }),
		]),
	).toEqual(["  Build   SUCCESSFUL  1m10s", "  Deploy  FAILED      5s"]);
});
