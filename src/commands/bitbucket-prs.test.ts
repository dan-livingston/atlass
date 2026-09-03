import kleur from "kleur";
import { expect, test } from "vite-plus/test";

import type { PullRequestSummary } from "#/api/bitbucket.ts";

import { pullRequestRows, pullRequestStates } from "#/commands/bitbucket-prs.ts";
import { colorForBitbucketState } from "#/commands/bitbucket.ts";

kleur.enabled = false;

const NOW = Date.parse("2026-08-31T12:00:00Z");

function pr(over: Partial<PullRequestSummary> = {}): PullRequestSummary {
	return {
		id: 42,
		title: "Fix the login redirect loop",
		state: "OPEN",
		draft: false,
		author: "Dana Scully",
		authorUuid: "{u}",
		sourceBranch: "fix/login",
		destinationBranch: "main",
		commentCount: 3,
		createdOn: "2026-08-29T12:00:00Z",
		updatedOn: "2026-08-31T10:00:00Z",
		url: "https://bitbucket.org/ws/app/pull-requests/42",
		...over,
	};
}

test("pr rows: id, state and age align, with the title as the free text", () => {
	const rows = pullRequestRows([pr(), pr({ id: 7, state: "MERGED", title: "Rotate keys" })], NOW);
	expect(rows.map((r) => r.fixedColumns)).toEqual(["#42  OPEN    2h ago", "#7   MERGED  2h ago"]);
	expect(rows.map((r) => r.freeText)).toEqual(["Fix the login redirect loop", "Rotate keys"]);
});

test("pr rows: age comes from the last update, not creation", () => {
	const rows = pullRequestRows([pr({ updatedOn: "2026-08-30T12:00:00Z" })], NOW);
	expect(rows[0]?.fixedColumns).toContain("1d ago");
});

test("pr rows: a draft says so instead of reading as open", () => {
	const rows = pullRequestRows([pr({ draft: true })], NOW);
	expect(rows[0]?.fixedColumns).toBe("#42  DRAFT  2h ago");
});

test("pr rows: the row links to the pull request", () => {
	expect(pullRequestRows([pr()], NOW)[0]?.url).toBe(
		"https://bitbucket.org/ws/app/pull-requests/42",
	);
});

test("states: no flags means no state param, leaving the api's open default", () => {
	expect(pullRequestStates({})).toEqual([]);
});

test("states: --all asks for every state", () => {
	expect(pullRequestStates({ all: true })).toEqual(["OPEN", "MERGED", "DECLINED", "SUPERSEDED"]);
});

test("states: --all and --state together are a contradiction, not a silent winner", () => {
	expect(() => pullRequestStates({ all: true, state: ["open"] })).toThrow(
		"--all cannot be combined with --state.",
	);
});

test("state colors: pipeline and pull request states share one map, unknowns stay plain", () => {
	kleur.enabled = true;
	const paint = (state: string) => colorForBitbucketState(state)(state);
	expect(paint("SUCCESSFUL")).toBe(kleur.green("SUCCESSFUL"));
	expect(paint("MERGED")).toBe(kleur.green("MERGED"));
	expect(paint("FAILED")).toBe(kleur.red("FAILED"));
	expect(paint("DECLINED")).toBe(kleur.red("DECLINED"));
	expect(paint("DRAFT")).toBe(kleur.gray("DRAFT"));
	expect(paint("SOMETHING_NEW")).toBe(kleur.white("SOMETHING_NEW"));
	kleur.enabled = false;
});
