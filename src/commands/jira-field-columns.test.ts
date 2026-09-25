import kleur from "kleur";
import { expect, test } from "vite-plus/test";

import { jiraJql, jiraList, jiraSearch } from "#/commands/jira-search.ts";
import { fakeJiraEnv, routed } from "#/test/env.ts";

kleur.enabled = false;

const FIELDS = {
	"/rest/api/3/field": [
		{ id: "summary", name: "Summary", schema: { type: "string" } },
		{ id: "customfield_10035", name: "Story Points", schema: { type: "number" } },
		{ id: "customfield_10041", name: "Actual Story Points", schema: { type: "number" } },
		{ id: "customfield_10016", name: "Story point estimate", schema: { type: "number" } },
		{ id: "customfield_10020", name: "Sprint", schema: { type: "array" } },
		{ id: "customfield_10050", name: "Team", schema: { type: "option" } },
		{ id: "customfield_10051", name: "team", schema: { type: "string" } },
		{ id: "customfield_10060", name: "customfield_10035", schema: { type: "string" } },
		{ id: "customfield_10070", name: "Reviewers", schema: { type: "array" } },
		{ id: "customfield_10071", name: "Notes", schema: { type: "string" } },
		{ id: "customfield_10072", name: "Severity", schema: { type: "option" } },
		{ id: "customfield_10073", name: "Owner", schema: { type: "user" } },
	],
};

const UPDATED = new Date(Date.now() - 3_600_000).toISOString();
const BASE_FIELDS = "summary,status,updated";
const JQL = "project = PROJ";

function searchPath(jql: string, limit: number, ids: string[] = [], token?: string): string {
	const query = new URLSearchParams({
		jql,
		maxResults: String(limit),
		fields: [BASE_FIELDS, ...ids].join(","),
	});
	if (token) query.set("nextPageToken", token);
	return `/rest/api/3/search/jql?${query.toString()}`;
}

function issue(key: string, status: string, extra: Record<string, unknown> = {}) {
	return {
		key,
		fields: {
			summary: `Summary ${key}`,
			status: { name: status, statusCategory: { key: "indeterminate" } },
			updated: UPDATED,
			...extra,
		},
	};
}

const POINTS_ISSUES = {
	issues: [
		issue("PROJ-1", "In Progress", { customfield_10035: 3 }),
		issue("PROJ-22", "Verified", { customfield_10035: null }),
	],
	isLast: true,
};

function pointsEnv(ids = ["customfield_10035"]) {
	return fakeJiraEnv({
		getJson: routed({ ...FIELDS, [searchPath(JQL, 25, ids)]: POINTS_ISSUES }),
	});
}

test("jql --field: a name adds a column after the status, summary last, empty as -", async () => {
	const env = pointsEnv();
	await jiraJql(env, JQL, { field: ["Story Points"] });

	expect(env.term.written).toEqual([
		[
			"PROJ-1   In Progress  3  1h ago  Summary PROJ-1",
			"PROJ-22  Verified     -  1h ago  Summary PROJ-22",
		].join("\n"),
	]);
});

test("jql --field: an id gives the same output as the name, and wins over a name equal to it", async () => {
	const byName = pointsEnv();
	await jiraJql(byName, JQL, { field: ["Story Points"] });
	const byId = pointsEnv();
	await jiraJql(byId, JQL, { field: ["customfield_10035"] });

	expect(byId.term.written).toEqual(byName.term.written);
});

test("jql --field: a name matches ignoring case", async () => {
	const env = pointsEnv();
	await jiraJql(env, JQL, { field: ["story points"] });

	expect(env.term.written[0]).toContain("PROJ-1   In Progress  3  1h ago  Summary PROJ-1");
});

test("jql --field: a name shared by several fields fails listing their ids before searching", async () => {
	const env = fakeJiraEnv({ getJson: routed(FIELDS) });
	await expect(jiraJql(env, JQL, { field: ["Team"] })).rejects.toThrow(
		'"Team" matches several fields. Use an id:\n  customfield_10050  Team\n  customfield_10051  team',
	);
});

test("jql --field: an unknown name fails pointing at fields --search before searching", async () => {
	const env = fakeJiraEnv({ getJson: routed(FIELDS) });
	await expect(jiraJql(env, JQL, { field: ["Velocity"] })).rejects.toThrow(
		'No field matches "Velocity". Run `atlass jira fields --search Velocity` to find it.',
	);
});

test("jql --field: values render readably, sprints by name, one column per field", async () => {
	const ids = [
		"customfield_10020",
		"customfield_10070",
		"customfield_10071",
		"customfield_10072",
		"customfield_10073",
	];
	const env = fakeJiraEnv(
		{
			getJson: routed({
				...FIELDS,
				[searchPath(JQL, 25, ids)]: {
					issues: [
						issue("PROJ-1", "Done", {
							customfield_10020: [
								{ id: 1907, name: "26.12 Polish", state: "closed" },
								{ id: 1908, name: "26.13 Content", state: "active" },
							],
							customfield_10070: [{ displayName: "Ana" }, { displayName: "Bo" }],
							customfield_10071: "Check logs",
							customfield_10072: { value: "High", id: "1" },
							customfield_10073: { displayName: "Cy", accountId: "abc" },
						}),
						issue("PROJ-2", "Done", { customfield_10020: [] }),
					],
					isLast: true,
				},
			}),
		},
		{ width: 120 },
	);
	await jiraJql(env, JQL, { field: ["Sprint", "Reviewers", "Notes", "Severity", "Owner"] });

	expect(env.term.written).toEqual([
		[
			"PROJ-1  Done  26.12 Polish, 26.13 Content  Ana, Bo  Check logs  High  Cy  1h ago  Summary PROJ-1",
			"PROJ-2  Done  -                            -        -           -     -   1h ago  Summary PROJ-2",
		].join("\n"),
	]);
});

test("jql --field --json: rows carry raw values keyed by the name as passed", async () => {
	const env = pointsEnv();
	await jiraJql(env, JQL, { field: ["Story Points", "customfield_10035"], json: true });

	const rows = env.term.emitted[0] as { key: string; fields: unknown }[];
	expect(rows.map((r) => [r.key, r.fields])).toEqual([
		["PROJ-1", { "Story Points": 3, customfield_10035: 3 }],
		["PROJ-22", { "Story Points": null, customfield_10035: null }],
	]);
});

test("jql without --field: no field lookup, the usual fields, and no fields key", async () => {
	const env = fakeJiraEnv({
		getJson: routed({ [searchPath(JQL, 25)]: { issues: [issue("PROJ-1", "Done")] } }),
	});
	await jiraJql(env, JQL, { json: true });

	expect(env.term.emitted).toEqual([
		[
			{
				key: "PROJ-1",
				status: "Done",
				statusCategory: "indeterminate",
				summary: "Summary PROJ-1",
				updated: UPDATED,
				url: "https://acme.atlassian.net/browse/PROJ-1",
			},
		],
	]);
});

test("search --field: the resolved field joins the search request", async () => {
	const jql = 'status = "Verified" ORDER BY updated DESC';
	const env = fakeJiraEnv({
		getJson: routed({
			...FIELDS,
			[searchPath(jql, 25, ["customfield_10041"])]: {
				issues: [issue("PROJ-9", "Verified", { customfield_10041: 5 })],
			},
		}),
	});
	await jiraSearch(env, undefined, { status: ["Verified"], field: ["Actual Story Points"] });

	expect(env.term.written).toEqual(["PROJ-9  Verified  5  1h ago  Summary PROJ-9"]);
});

test("search --field: an unknown field fails before searching", async () => {
	const env = fakeJiraEnv({ getJson: routed(FIELDS) });
	await expect(
		jiraSearch(env, undefined, { status: ["Verified"], field: ["Velocity"] }),
	).rejects.toThrow('No field matches "Velocity".');
});

test("list --field: every page asks for the field and every row carries it", async () => {
	const jql = "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC";
	const ids = ["customfield_10016"];
	const env = fakeJiraEnv({
		getJson: routed({
			...FIELDS,
			[searchPath(jql, 100, ids)]: {
				issues: [issue("PROJ-1", "In Progress", { customfield_10016: 2 })],
				nextPageToken: "t2",
			},
			[searchPath(jql, 100, ids, "t2")]: {
				issues: [issue("PROJ-2", "In Progress", { customfield_10016: 8 })],
				isLast: true,
			},
		}),
	});
	await jiraList(env, { field: ["Story point estimate"], json: true });

	const rows = env.term.emitted[0] as { key: string; fields: unknown }[];
	expect(rows.map((r) => [r.key, r.fields])).toEqual([
		["PROJ-1", { "Story point estimate": 2 }],
		["PROJ-2", { "Story point estimate": 8 }],
	]);
});
