import { expect, test } from "vite-plus/test";

import { HttpError } from "#/api/http-error.ts";
import { jiraSprints } from "#/commands/jira-sprints.ts";
import { fakeJiraEnv, routed } from "#/test/env.ts";

const sprintsPath = (state: string, startAt = 0) =>
	`/rest/agile/1.0/board/11/sprint?state=${state}&startAt=${startAt}&maxResults=50`;

const ACTIVE = {
	id: 1908,
	state: "active",
	name: "26.13 Content",
	startDate: "2026-09-13T22:30:00.000Z",
	endDate: "2026-10-04T22:30:00.000Z",
	originBoardId: 11,
};

const FUTURE_PLANNED = {
	id: 1912,
	state: "future",
	name: "26.14 Polish",
	startDate: "2026-10-04T22:30:00.000Z",
	endDate: "2026-10-25T22:30:00.000Z",
	originBoardId: 11,
};

const FUTURE_UNDATED = { id: 1915, state: "future", name: "26.15 Backlog", originBoardId: 11 };

const CLOSED_OLDER = {
	id: 1850,
	state: "closed",
	name: "26.11 Combat",
	startDate: "2026-08-02T22:30:00.000Z",
	endDate: "2026-08-23T22:30:00.000Z",
	completeDate: "2026-08-24T01:00:00.000Z",
	originBoardId: 11,
};

const CLOSED_NEWER = {
	id: 1880,
	state: "closed",
	name: "26.12 Audio",
	startDate: "2026-08-23T22:30:00.000Z",
	endDate: "2026-09-13T22:30:00.000Z",
	completeDate: "2026-09-14T00:15:00.000Z",
	originBoardId: 11,
};

test("jira sprints: with no --state only active sprints are listed, dates in local time", async () => {
	const env = fakeJiraEnv({
		getJson: routed({ [sprintsPath("active")]: { isLast: true, values: [ACTIVE] } }),
	});
	await jiraSprints(env, "11", {});

	expect(env.term.written).toEqual(["1908  active  26.13 Content  2026-09-14  2026-10-05"]);
	expect(env.term.errors).toEqual([]);
});

test("jira sprints: repeated --state values combine, ordered active, future, closed newest first", async () => {
	const env = fakeJiraEnv({
		getJson: routed({
			[sprintsPath("active,future,closed")]: {
				isLast: false,
				values: [CLOSED_OLDER, CLOSED_NEWER, ACTIVE],
			},
			[sprintsPath("active,future,closed", 3)]: {
				isLast: true,
				values: [FUTURE_PLANNED, FUTURE_UNDATED],
			},
		}),
	});
	await jiraSprints(env, "11", { state: ["closed", "future", "active"] });

	expect(env.term.written).toEqual([
		[
			"1908  active  26.13 Content  2026-09-14  2026-10-05",
			"1912  future  26.14 Polish   2026-10-05  2026-10-26",
			"1915  future  26.15 Backlog  -           -",
			"1880  closed  26.12 Audio    2026-08-24  2026-09-14",
			"1850  closed  26.11 Combat   2026-08-03  2026-08-24",
		].join("\n"),
	]);
});

test("jira sprints: --state accepts comma separated values and ignores case", async () => {
	const env = fakeJiraEnv({
		getJson: routed({
			[sprintsPath("future,closed")]: {
				isLast: true,
				values: [CLOSED_OLDER, FUTURE_UNDATED],
			},
		}),
	});
	await jiraSprints(env, "11", { state: ["Future,CLOSED"] });

	expect(env.term.written).toEqual([
		[
			"1915  future  26.15 Backlog  -           -",
			"1850  closed  26.11 Combat   2026-08-03  2026-08-24",
		].join("\n"),
	]);
});

test("jira sprints: an unknown --state fails before any request", async () => {
	const env = fakeJiraEnv({ getJson: routed({}) });

	await expect(jiraSprints(env, "11", { state: ["open"] })).rejects.toThrow(
		'Invalid --state "open". Expected active, future, or closed.',
	);
});

test("jira sprints: --limit caps the rows after ordering and says when more exist", async () => {
	const env = fakeJiraEnv({
		getJson: routed({
			[sprintsPath("closed")]: { isLast: true, values: [CLOSED_OLDER, CLOSED_NEWER] },
		}),
	});
	await jiraSprints(env, "11", { state: ["closed"], limit: "1" });

	expect(env.term.written).toEqual([
		[
			"1880  closed  26.12 Audio  2026-08-24  2026-09-14",
			"",
			"Showing first 1; refine with flags or raise --limit.",
		].join("\n"),
	]);
});

test("jira sprints: no footer when the rows exactly fill the limit", async () => {
	const env = fakeJiraEnv({
		getJson: routed({
			[sprintsPath("closed")]: { isLast: true, values: [CLOSED_OLDER, CLOSED_NEWER] },
		}),
	});
	await jiraSprints(env, "11", { state: ["closed"], limit: "2" });

	expect(env.term.written).toEqual([
		[
			"1880  closed  26.12 Audio   2026-08-24  2026-09-14",
			"1850  closed  26.11 Combat  2026-08-03  2026-08-24",
		].join("\n"),
	]);
});

test("jira sprints: a board with no sprints in the chosen states says so", async () => {
	const env = fakeJiraEnv({
		getJson: routed({ [sprintsPath("active,future")]: { isLast: true, values: [] } }),
	});
	await jiraSprints(env, "11", { state: ["future", "active"] });

	expect(env.term.written).toEqual(["No active or future sprints."]);
});

test("jira sprints: a board name resolves like jira board", async () => {
	const env = fakeJiraEnv({
		getJson: routed({
			"/rest/agile/1.0/board?startAt=0&maxResults=50": {
				isLast: true,
				values: [{ id: 11, name: "Blastworks Sprint", type: "scrum" }],
			},
			[sprintsPath("active")]: { isLast: true, values: [ACTIVE] },
		}),
	});
	await jiraSprints(env, "blastworks sprint", {});

	expect(env.term.written).toEqual(["1908  active  26.13 Content  2026-09-14  2026-10-05"]);
});

test("jira sprints: --json emits id, state, name, start, end and board id in display order", async () => {
	const env = fakeJiraEnv({
		getJson: routed({
			[sprintsPath("active,future")]: {
				isLast: true,
				values: [FUTURE_UNDATED, { ...ACTIVE, originBoardId: undefined }],
			},
		}),
	});
	await jiraSprints(env, "https://acme.atlassian.net/jira/software/c/projects/BW/boards/11", {
		state: ["active", "future"],
		json: true,
	});

	expect(env.term.emitted).toEqual([
		[
			{
				id: 1908,
				state: "active",
				name: "26.13 Content",
				start: "2026-09-13T22:30:00.000Z",
				end: "2026-10-04T22:30:00.000Z",
				boardId: 11,
			},
			{
				id: 1915,
				state: "future",
				name: "26.15 Backlog",
				start: null,
				end: null,
				boardId: 11,
			},
		],
	]);
	expect(env.term.written).toEqual([]);
});

test("jira sprints: --json is capped by --limit too", async () => {
	const env = fakeJiraEnv({
		getJson: routed({
			[sprintsPath("closed")]: { isLast: true, values: [CLOSED_OLDER, CLOSED_NEWER] },
		}),
	});
	await jiraSprints(env, "11", { state: ["closed"], limit: "1", json: true });

	expect(env.term.emitted).toMatchObject([[{ id: 1880 }]]);
});

test("jira sprints: --json gives a shared sprint the board it was created on", async () => {
	const env = fakeJiraEnv({
		getJson: routed({
			[sprintsPath("active")]: { isLast: true, values: [{ ...ACTIVE, originBoardId: 12 }] },
		}),
	});
	await jiraSprints(env, "11", { json: true });

	expect(env.term.emitted).toMatchObject([[{ id: 1908, boardId: 12 }]]);
});

test("jira sprints: a board without sprints fails plainly", async () => {
	const env = fakeJiraEnv({
		getJson: (path) => {
			throw new HttpError(
				400,
				"Bad request (400): The board does not support sprints",
				undefined,
				path,
			);
		},
	});

	await expect(jiraSprints(env, "204", {})).rejects.toThrow(
		"Board 204 does not support sprints. Only scrum boards have them.",
	);
});
