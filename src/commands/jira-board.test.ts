import kleur from "kleur";
import { expect, test } from "vite-plus/test";

import { HttpError } from "#/api/http-error.ts";
import { jiraBoard } from "#/commands/jira-board.ts";
import { fakeJiraEnv, routed } from "#/test/env.ts";

kleur.enabled = false;

const BOARD_LIST = {
	"/rest/agile/1.0/board?startAt=0&maxResults=50": {
		isLast: true,
		values: [
			{
				id: 11,
				name: "Blastworks Sprint",
				type: "scrum",
				location: { projectKey: "BW" },
			},
			{ id: 204, name: "Cross-team Kanban", type: "kanban" },
			{ id: 205, name: "Cross-team kanban", type: "kanban" },
		],
	},
};

const SCRUM_BOARD = {
	"/rest/agile/1.0/board/11/configuration": {
		id: 11,
		name: "Blastworks Sprint",
		type: "scrum",
		filter: { id: "10040" },
		columnConfig: {
			columns: [
				{ name: "To Do", statuses: [{ id: "1" }] },
				{ name: "In Progress", statuses: [{ id: "3" }] },
				{ name: "Done", statuses: [{ id: "10010" }, { id: "6" }] },
			],
		},
		estimation: {
			type: "field",
			field: { fieldId: "customfield_10035", displayName: "Story Points" },
		},
	},
	"/rest/api/3/filter/10040": { id: "10040", jql: "project = BW ORDER BY Rank ASC" },
	"/rest/api/3/status": [
		{ id: "1", name: "Open", statusCategory: { key: "new", name: "To Do" } },
		{
			id: "3",
			name: "In Progress",
			statusCategory: { key: "indeterminate", name: "In Progress" },
		},
		{
			id: "10010",
			name: "Verified",
			statusCategory: { key: "indeterminate", name: "In Progress" },
		},
		{ id: "6", name: "Closed", statusCategory: { key: "done", name: "Done" } },
	],
};

const KANBAN_BOARD = {
	"/rest/agile/1.0/board/204/configuration": {
		id: 204,
		name: "Cross-team Kanban",
		type: "kanban",
		filter: { id: "10077" },
		subQuery: { query: "fixVersion in unreleasedVersions() OR fixVersion is EMPTY" },
		columnConfig: { columns: [{ name: "Backlog", statuses: [{ id: "1" }] }] },
	},
	"/rest/api/3/filter/10077": { id: "10077", jql: "labels = cross-team" },
	"/rest/api/3/status": SCRUM_BOARD["/rest/api/3/status"],
};

function routedWithMissing(json: Record<string, unknown>): (path: string) => unknown {
	return (path) => {
		if (!(path in json)) throw new HttpError(404, `Not found (404): ${path}`, undefined, path);
		return json[path];
	};
}

const SCRUM_VIEW = [
	"Blastworks Sprint",
	"ID:          11",
	"Type:        scrum",
	"Estimation:  Story Points (customfield_10035)",
	"Filter:      project = BW ORDER BY Rank ASC",
	"URL:         https://acme.atlassian.net/secure/RapidBoard.jspa?rapidView=11",
	"",
	"To Do",
	"  Open         To Do",
	"In Progress",
	"  In Progress  In Progress",
	"Done",
	"  Verified     In Progress",
	"  Closed       Done",
].join("\n");

test("jira board: an id shows estimation, filter JQL and each column's statuses with categories", async () => {
	const env = fakeJiraEnv({ getJson: routed(SCRUM_BOARD) });
	await jiraBoard(env, "11", {});

	expect(env.term.written).toEqual([SCRUM_VIEW]);
	expect(env.term.errors).toEqual([]);
});

test.each([
	"https://acme.atlassian.net/jira/software/c/projects/BW/boards/11",
	"https://acme.atlassian.net/jira/software/projects/BW/boards/11/backlog?selectedIssue=BW-3",
	"https://acme.atlassian.net/jira/people/61958254744c4d00695a2916/boards/11",
	"https://acme.atlassian.net/secure/RapidBoard.jspa?rapidView=11",
])("jira board: the URL %s resolves to the same board as its id", async (url) => {
	const env = fakeJiraEnv({ getJson: routed(SCRUM_BOARD) });
	await jiraBoard(env, url, {});

	expect(env.term.written).toEqual([SCRUM_VIEW]);
});

test("jira board: a name matches exactly, ignoring case, against every listed board", async () => {
	const env = fakeJiraEnv({ getJson: routed({ ...BOARD_LIST, ...SCRUM_BOARD }) });
	await jiraBoard(env, "blastworks SPRINT", {});

	expect(env.term.written).toEqual([SCRUM_VIEW]);
});

test("jira board: a name that matches several boards fails listing each id and name", async () => {
	const env = fakeJiraEnv({ getJson: routed(BOARD_LIST) });

	await expect(jiraBoard(env, "cross-team kanban", {})).rejects.toThrow(
		[
			'"cross-team kanban" matches several boards. Use an id:',
			"  204  Cross-team Kanban",
			"  205  Cross-team kanban",
		].join("\n"),
	);
});

test("jira board: a name that only partly matches is unknown and points at jira boards", async () => {
	const env = fakeJiraEnv({ getJson: routed(BOARD_LIST) });

	await expect(jiraBoard(env, "Blastworks", {})).rejects.toThrow(
		'No board matches "Blastworks". Run `atlass jira boards` to list boards.',
	);
});

test("jira board: an id or URL with no board behind it fails the same way", async () => {
	const env = fakeJiraEnv({
		getJson: routedWithMissing({}),
	});

	await expect(
		jiraBoard(env, "https://acme.atlassian.net/jira/software/c/projects/BW/boards/99", {}),
	).rejects.toThrow(
		'No board matches "https://acme.atlassian.net/jira/software/c/projects/BW/boards/99". Run `atlass jira boards` to list boards.',
	);
});

test("jira board: a board without field estimation says so plainly", async () => {
	const env = fakeJiraEnv({ getJson: routed(KANBAN_BOARD) });
	await jiraBoard(env, "204", {});

	expect(env.term.written).toEqual([
		[
			"Cross-team Kanban",
			"ID:          204",
			"Type:        kanban",
			"Estimation:  none, this board does not estimate with a field",
			"Filter:      labels = cross-team",
			"Sub-filter:  fixVersion in unreleasedVersions() OR fixVersion is EMPTY",
			"URL:         https://acme.atlassian.net/secure/RapidBoard.jspa?rapidView=204",
			"",
			"Backlog",
			"  Open  To Do",
		].join("\n"),
	]);
});

test("jira board: --json carries estimation, filter JQL and column statuses with category keys", async () => {
	const env = fakeJiraEnv({ getJson: routed(SCRUM_BOARD) });
	await jiraBoard(env, "11", { json: true });

	expect(env.term.emitted).toEqual([
		{
			id: 11,
			name: "Blastworks Sprint",
			type: "scrum",
			url: "https://acme.atlassian.net/secure/RapidBoard.jspa?rapidView=11",
			estimation: { fieldId: "customfield_10035", fieldName: "Story Points" },
			filter: { id: "10040", jql: "project = BW ORDER BY Rank ASC", subQuery: null },
			columns: [
				{
					name: "To Do",
					statuses: [{ id: "1", name: "Open", category: "To Do", categoryKey: "new" }],
				},
				{
					name: "In Progress",
					statuses: [
						{
							id: "3",
							name: "In Progress",
							category: "In Progress",
							categoryKey: "indeterminate",
						},
					],
				},
				{
					name: "Done",
					statuses: [
						{
							id: "10010",
							name: "Verified",
							category: "In Progress",
							categoryKey: "indeterminate",
						},
						{ id: "6", name: "Closed", category: "Done", categoryKey: "done" },
					],
				},
			],
		},
	]);
	expect(env.term.written).toEqual([]);
});

test("jira board: --json gives a null estimation for a board without one", async () => {
	const env = fakeJiraEnv({ getJson: routed(KANBAN_BOARD) });
	await jiraBoard(env, "204", { json: true });

	expect(env.term.emitted).toMatchObject([
		{
			id: 204,
			estimation: null,
			filter: {
				jql: "labels = cross-team",
				subQuery: "fixVersion in unreleasedVersions() OR fixVersion is EMPTY",
			},
		},
	]);
});

test("jira board: a filter the user cannot see still shows the estimation and columns", async () => {
	const { "/rest/api/3/filter/10077": _hidden, ...visible } = KANBAN_BOARD;
	const env = fakeJiraEnv({ getJson: routedWithMissing(visible) });
	await jiraBoard(env, "204", {});

	expect(env.term.written[0]).toContain("Filter:      not visible to you (filter 10077)");
	expect(env.term.written[0]).toContain("Backlog\n  Open  To Do");
});

test("jira board: --json gives a null JQL for a filter the user cannot see", async () => {
	const { "/rest/api/3/filter/10077": _hidden, ...visible } = KANBAN_BOARD;
	const env = fakeJiraEnv({ getJson: routedWithMissing(visible) });
	await jiraBoard(env, "204", { json: true });

	expect(env.term.emitted).toMatchObject([{ filter: { id: "10077", jql: null } }]);
});
