import kleur from "kleur";
import { expect, test } from "vite-plus/test";

import type { PipelineDetail, StepSummary } from "#/api/bitbucket-pipelines.ts";

import { formatPipelineDetail } from "#/commands/bitbucket.ts";

kleur.enabled = false;

const NOW = Date.parse("2026-07-17T12:00:00Z");

function detail(over: Partial<PipelineDetail> = {}): PipelineDetail {
	return {
		buildNumber: 124,
		status: "SUCCESSFUL",
		ref: "main",
		commit: "a1b2c3d",
		durationSeconds: 154,
		createdOn: "2026-07-14T12:00:00Z",
		creator: "Ada",
		uuid: "{u-1}",
		url: "https://bitbucket.org/acme/api/pipelines/124",
		repo: "acme/api",
		trigger: "push",
		...over,
	};
}

function step(over: Partial<StepSummary> = {}): StepSummary {
	return { name: "Build", status: "SUCCESSFUL", durationSeconds: 90, ...over };
}

test("every field is laid out in a fixed order with aligned labels", () => {
	expect(formatPipelineDetail(detail(), [], NOW)).toEqual([
		"Pipeline #124  SUCCESSFUL",
		"Repo:     acme/api",
		"Ref:      main (a1b2c3d)",
		"Trigger:  push",
		"Duration: 2m34s",
		"Created:  3d ago by Ada",
	]);
});

test("an absent repo or trigger drops its row rather than printing a blank", () => {
	expect(formatPipelineDetail(detail({ repo: "", trigger: "" }), [], NOW)).toEqual([
		"Pipeline #124  SUCCESSFUL",
		"Ref:      main (a1b2c3d)",
		"Duration: 2m34s",
		"Created:  3d ago by Ada",
	]);
});

test("an unknown creator drops the by clause but keeps the age", () => {
	expect(formatPipelineDetail(detail({ creator: "" }), [], NOW).at(-1)).toBe("Created:  3d ago");
});

test("a ref with no commit is printed bare, and no ref falls back to the commit", () => {
	expect(formatPipelineDetail(detail({ commit: "" }), [], NOW)[2]).toBe("Ref:      main");
	expect(formatPipelineDetail(detail({ ref: "" }), [], NOW)[2]).toBe("Ref:      a1b2c3d");
});

test("steps follow a blank line and a heading, aligned across names and statuses", () => {
	const lines = formatPipelineDetail(
		detail(),
		[step(), step({ name: "Deploy to prod", status: "FAILED", durationSeconds: 12 })],
		NOW,
	);
	expect(lines.slice(-4)).toEqual([
		"",
		"Steps:",
		"  Build           SUCCESSFUL  1m30s",
		"  Deploy to prod  FAILED      12s",
	]);
});

test("no steps means no heading at all", () => {
	expect(formatPipelineDetail(detail(), [], NOW)).not.toContain("Steps:");
});
