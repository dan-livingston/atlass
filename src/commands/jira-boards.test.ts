import { expect, test } from "vite-plus/test";

import { jiraBoards } from "#/commands/jira-boards.ts";
import { fakeJiraEnv, routed } from "#/test/env.ts";

const FIRST_PAGE = "/rest/agile/1.0/board?startAt=0&maxResults=50";
const SECOND_PAGE = "/rest/agile/1.0/board?startAt=2&maxResults=50";

const BOARDS = {
	[FIRST_PAGE]: {
		isLast: false,
		values: [
			{
				id: 11,
				name: "Blastworks Sprint",
				type: "scrum",
				location: { projectKey: "BW", projectName: "Blastworks" },
			},
			{ id: 204, name: "Cross-team Kanban", type: "kanban" },
		],
	},
	[SECOND_PAGE]: {
		isLast: true,
		values: [
			{
				id: 7,
				name: "Ops board",
				type: "simple",
				location: { projectKey: "OPS", projectName: "Operations" },
			},
		],
	},
};

test("jira boards: every page is listed as aligned rows, a board with no project included", async () => {
	const env = fakeJiraEnv({ getJson: routed(BOARDS) });
	await jiraBoards(env, undefined, {});

	expect(env.term.written).toEqual([
		[
			"11   scrum   Blastworks Sprint  BW",
			"204  kanban  Cross-team Kanban",
			"7    simple  Ops board          OPS",
		].join("\n"),
	]);
	expect(env.term.errors).toEqual([]);
});

test("jira boards: a query keeps boards whose name contains it, ignoring case", async () => {
	const env = fakeJiraEnv({ getJson: routed(BOARDS) });
	await jiraBoards(env, "KANBAN", {});

	expect(env.term.written).toEqual(["204  kanban  Cross-team Kanban"]);
});

test("jira boards: --project keeps boards located in that project, ignoring case", async () => {
	const env = fakeJiraEnv({ getJson: routed(BOARDS) });
	await jiraBoards(env, undefined, { project: "ops" });

	expect(env.term.written).toEqual(["7  simple  Ops board  OPS"]);
});

test("jira boards: no matches says so rather than printing an empty block", async () => {
	const env = fakeJiraEnv({ getJson: routed(BOARDS) });
	await jiraBoards(env, "sprint", { project: "OPS" });

	expect(env.term.written).toEqual(["No matching boards."]);
});

test("jira boards: --json emits every board with stable keys and no rows", async () => {
	const env = fakeJiraEnv({ getJson: routed(BOARDS) });
	await jiraBoards(env, undefined, { json: true });

	expect(env.term.emitted).toEqual([
		[
			{
				id: 11,
				name: "Blastworks Sprint",
				type: "scrum",
				project: "BW",
				url: "https://acme.atlassian.net/secure/RapidBoard.jspa?rapidView=11",
			},
			{
				id: 204,
				name: "Cross-team Kanban",
				type: "kanban",
				project: null,
				url: "https://acme.atlassian.net/secure/RapidBoard.jspa?rapidView=204",
			},
			{
				id: 7,
				name: "Ops board",
				type: "simple",
				project: "OPS",
				url: "https://acme.atlassian.net/secure/RapidBoard.jspa?rapidView=7",
			},
		],
	]);
	expect(env.term.written).toEqual([]);
});

test("jira boards: a site with no boards says so", async () => {
	const env = fakeJiraEnv({ getJson: routed({ [FIRST_PAGE]: { isLast: true, values: [] } }) });
	await jiraBoards(env, undefined, {});

	expect(env.term.written).toEqual(["No matching boards."]);
});
