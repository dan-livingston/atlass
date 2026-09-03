import kleur from "kleur";
import { expect, test } from "vite-plus/test";

import { jiraProjects, jiraStatuses, jiraView } from "#/commands/jira.ts";
import { fakeEnv, routed } from "#/test/env.ts";

kleur.enabled = false;

const PROJECTS = {
	"/rest/api/3/project/search?orderBy=key&maxResults=50&startAt=0": {
		isLast: true,
		values: [
			{ key: "OPS", name: "Operations" },
			{ key: "PLATFORM", name: "Platform" },
		],
	},
};

test("jira projects: rows go to stdout, aligned, with nothing on stderr", async () => {
	const env = fakeEnv({ getJson: routed(PROJECTS) });
	await jiraProjects(env, undefined, {});

	expect(env.term.written).toEqual(["OPS       Operations\nPLATFORM  Platform"]);
	expect(env.term.errors).toEqual([]);
});

test("jira projects: --json emits the fetched projects and no rows", async () => {
	const env = fakeEnv({ getJson: routed(PROJECTS) });
	await jiraProjects(env, undefined, { json: true });

	expect(env.term.emitted).toEqual([
		[
			{
				key: "OPS",
				name: "Operations",
				id: undefined,
				type: "",
				url: "https://acme.atlassian.net/browse/OPS",
			},
			{
				key: "PLATFORM",
				name: "Platform",
				id: undefined,
				type: "",
				url: "https://acme.atlassian.net/browse/PLATFORM",
			},
		],
	]);
	expect(env.term.written).toEqual([]);
});

test("jira projects: no matches says so rather than printing an empty block", async () => {
	const env = fakeEnv({
		getJson: routed({
			"/rest/api/3/project/search?orderBy=key&maxResults=50&startAt=0&query=zz": {
				isLast: true,
				values: [],
			},
		}),
	});
	await jiraProjects(env, "zz", {});

	expect(env.term.written).toEqual(["No matching projects."]);
});

test("jira statuses: a query filters the fetched list before printing", async () => {
	const env = fakeEnv({
		getJson: routed({
			"/rest/api/3/status": [
				{ id: "1", name: "To Do", statusCategory: { key: "new", name: "To Do" } },
				{
					id: "2",
					name: "In Progress",
					statusCategory: { key: "indeterminate", name: "In Progress" },
				},
			],
		}),
	});
	await jiraStatuses(env, "progress", {});

	expect(env.term.written).toEqual(["In Progress  In Progress"]);
});

test("jira view: the rendered issue goes through the pager, not a plain write", async () => {
	const env = fakeEnv({
		getJson: routed({
			"/rest/api/3/issue/PROJ-7?fields=summary,description,issuetype,status,assignee,reporter,priority,labels,created,updated,attachment":
				{
					key: "PROJ-7",
					fields: {
						summary: "Login page broken",
						issuetype: { name: "Bug" },
						status: {
							id: "2",
							name: "In Progress",
							statusCategory: { key: "indeterminate", name: "In Progress" },
						},
						labels: [],
						attachment: [],
					},
				},
			"/rest/api/3/issue/PROJ-7/comment?maxResults=100&orderBy=created": { comments: [] },
		}),
	});
	await jiraView(env, "PROJ-7", {});

	expect(env.term.written).toEqual([]);
	expect(env.term.paged).toHaveLength(1);
	expect(env.term.paged[0]).toContain("PROJ-7  Login page broken");
	expect(env.term.paged[0]).toContain("Status:    In Progress");
});

test("jira view: a reference the parser rejects never reaches the api", async () => {
	const env = fakeEnv();
	await expect(jiraView(env, "not-a-key", {})).rejects.toThrow(
		'Could not find an issue key in "not-a-key"',
	);
});
