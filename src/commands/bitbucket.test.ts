import kleur from "kleur";
import { expect, test } from "vite-plus/test";

import type { PipelineSummary, StepSummary } from "#/api/bitbucket-pipelines.ts";

import { formatStepRows, pipelineRows } from "#/commands/bitbucket.ts";
import { formatRow } from "#/commands/search-run.ts";

kleur.enabled = false;

const NOW = Date.parse("2026-07-17T12:00:00Z");

function pipeline(over: Partial<PipelineSummary>): PipelineSummary {
	return {
		buildNumber: 1,
		status: "SUCCESSFUL",
		ref: "main",
		commit: "a1b2c3d",
		durationSeconds: 154,
		createdOn: "2026-07-14T12:00:00Z",
		creator: "Dana Scully",
		uuid: "{u}",
		url: "https://bitbucket.org/ws/app/pipelines/results/1",
		...over,
	};
}

test("pipeline rows: build number, status and age align, ref and duration follow", () => {
	const rows = pipelineRows(
		[
			pipeline({ buildNumber: 124, status: "SUCCESSFUL", ref: "main", durationSeconds: 154 }),
			pipeline({
				buildNumber: 12,
				status: "FAILED",
				ref: "feat/login",
				durationSeconds: 62,
			}),
		],
		NOW,
	);
	expect(rows.map((r) => r.fixedColumns)).toEqual([
		"#124  SUCCESSFUL  3d ago",
		"#12   FAILED      3d ago",
	]);
	expect(rows.map((r) => r.freeText)).toEqual([
		"main (a1b2c3d) · 2m34s",
		"feat/login (a1b2c3d) · 1m02s",
	]);
});

test("pipeline rows: the printed line keeps ref and duration apart", () => {
	const rows = pipelineRows([pipeline({ buildNumber: 124 })], NOW);
	expect(formatRow(rows[0]!, 80)).toBe("#124  SUCCESSFUL  3d ago  main (a1b2c3d) · 2m34s");
});

test("pipeline rows: age comes from when the run was created", () => {
	const rows = pipelineRows([pipeline({ createdOn: "2026-07-17T09:00:00Z" })], NOW);
	expect(rows[0]?.fixedColumns).toContain("3h ago");
});

test("pipeline rows: a running build has no duration", () => {
	const rows = pipelineRows(
		[pipeline({ buildNumber: 5, status: "IN_PROGRESS", durationSeconds: null })],
		NOW,
	);
	expect(rows[0]?.fixedColumns).toBe("#5  IN_PROGRESS  3d ago");
	expect(rows[0]?.freeText).toBe("main (a1b2c3d) · -");
});

test("pipeline rows: a commit-target run with no branch ref shows the commit", () => {
	const rows = pipelineRows([pipeline({ ref: "", commit: "5c09b34" })], NOW);
	expect(rows[0]?.freeText).toBe("5c09b34 · 2m34s");
});

test("pipeline rows: the row links to the run", () => {
	const rows = pipelineRows([pipeline({ buildNumber: 124 })], NOW);
	expect(rows[0]?.id).toBe("#124");
	expect(rows[0]?.url).toBe("https://bitbucket.org/ws/app/pipelines/results/1");
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
