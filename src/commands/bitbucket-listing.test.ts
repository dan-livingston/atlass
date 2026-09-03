import kleur from "kleur";
import { expect, test } from "vite-plus/test";

import { bitbucketPrs } from "#/commands/bitbucket-prs.ts";
import { bitbucketPipeline, bitbucketPipelines } from "#/commands/bitbucket.ts";
import { fakeBitbucketEnv } from "#/test/env.ts";

kleur.enabled = false;

const NOW = "2026-07-14T12:00:00Z";

function pipelineValue(buildNumber: number, result: string) {
	return {
		build_number: buildNumber,
		uuid: `{p-${buildNumber}}`,
		state: { name: "COMPLETED", result: { name: result } },
		target: { ref_name: "main", commit: { hash: "a1b2c3d4e5" } },
		created_on: NOW,
		completed_on: "2026-07-14T12:02:34Z",
		creator: { display_name: "Ada" },
		repository: { full_name: "acme/api" },
		trigger: { name: "push" },
	};
}

function answering(payload: unknown, seen: string[] = []) {
	return {
		getJson: (path: string) => {
			seen.push(path);
			return payload;
		},
	};
}

test("pipelines: rows are written and the repo comes from config when no flag is given", async () => {
	const seen: string[] = [];
	const env = fakeBitbucketEnv({
		...answering({ values: [pipelineValue(124, "SUCCESSFUL")] }, seen),
		workspace: "acme",
		defaultRepo: "api",
	});
	await bitbucketPipelines(env, {});

	expect(seen[0]).toContain("/2.0/repositories/acme/api/pipelines");
	expect(env.term.written).toHaveLength(1);
	expect(env.term.written[0]).toContain("#124");
	expect(env.term.written[0]).toContain("SUCCESSFUL");
});

test("pipelines: --json emits the rows and writes no lines", async () => {
	const env = fakeBitbucketEnv({
		...answering({ values: [pipelineValue(124, "SUCCESSFUL")] }),
		workspace: "acme",
		defaultRepo: "api",
	});
	await bitbucketPipelines(env, { json: true });

	expect(env.term.written).toEqual([]);
	expect(env.term.emitted).toHaveLength(1);
});

test("pipelines: an empty result says so instead of writing a blank line", async () => {
	const env = fakeBitbucketEnv({
		...answering({ values: [] }),
		workspace: "acme",
		defaultRepo: "api",
	});
	await bitbucketPipelines(env, {});

	expect(env.term.written).toEqual(["No pipelines found."]);
});

test("pipelines: with no --repo and no default, the error names the flag", async () => {
	const env = fakeBitbucketEnv({ ...answering({ values: [] }), workspace: "acme" });
	await expect(bitbucketPipelines(env, {})).rejects.toThrow("--repo");
});

test("pipeline: a detail is written as a block, not row by row", async () => {
	const env = fakeBitbucketEnv({
		getJson: (path: string) =>
			path.endsWith("/steps") || path.includes("/steps?")
				? { values: [] }
				: pipelineValue(124, "SUCCESSFUL"),
		workspace: "acme",
		defaultRepo: "api",
	});
	await bitbucketPipeline(env, "124", {});

	expect(env.term.written).toHaveLength(1);
	expect(env.term.written[0]).toContain("Pipeline #124  SUCCESSFUL");
	expect(env.term.written[0]).toContain("Repo:     acme/api");
});

test("pipeline: a build number that is not a number is rejected before any request", async () => {
	const seen: string[] = [];
	const env = fakeBitbucketEnv({
		...answering({ values: [] }, seen),
		workspace: "acme",
		defaultRepo: "api",
	});
	await expect(bitbucketPipeline(env, "latest", {})).rejects.toThrow(
		'Invalid pipeline number "latest"',
	);
	expect(seen).toEqual([]);
});

test("prs: --query cannot be combined with --author, and nothing is fetched", async () => {
	const seen: string[] = [];
	const env = fakeBitbucketEnv({
		...answering({ values: [] }, seen),
		workspace: "acme",
		defaultRepo: "api",
	});
	await expect(bitbucketPrs(env, { query: 'title~"fix"', author: "me" })).rejects.toThrow(
		"--query cannot be combined with --author or --reviewer.",
	);
	expect(seen).toEqual([]);
});

test("prs: --all cannot be combined with --state", async () => {
	const env = fakeBitbucketEnv({
		...answering({ values: [] }),
		workspace: "acme",
		defaultRepo: "api",
	});
	await expect(bitbucketPrs(env, { all: true, state: ["OPEN"] })).rejects.toThrow(
		"--all cannot be combined with --state.",
	);
});

test("prs: rows are written, and an empty result explains which states were searched", async () => {
	const env = fakeBitbucketEnv({
		...answering({ values: [] }),
		workspace: "acme",
		defaultRepo: "api",
	});
	await bitbucketPrs(env, {});

	expect(env.term.written).toHaveLength(1);
	expect(env.term.written[0]).toContain("No ");
});
