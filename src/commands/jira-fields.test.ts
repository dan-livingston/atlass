import kleur from "kleur";
import { expect, test } from "vite-plus/test";

import { jiraFields } from "#/commands/jira-fields.ts";
import { fakeJiraEnv, routed } from "#/test/env.ts";

kleur.enabled = false;

const SITE = {
	"/rest/api/3/field": [
		{
			id: "summary",
			name: "Summary",
			custom: false,
			schema: { type: "string", system: "summary" },
		},
		{
			id: "customfield_10035",
			name: "Story Points",
			custom: true,
			schema: {
				type: "number",
				custom: "com.atlassian.jira.plugin.system.customfieldtypes:float",
				customId: 10035,
			},
		},
		{
			id: "customfield_10020",
			name: "Sprint",
			custom: true,
			schema: {
				type: "array",
				items: "json",
				custom: "com.pyxis.greenhopper.jira:gh-sprint",
				customId: 10020,
			},
		},
		{
			id: "customfield_10016",
			name: "Story point estimate",
			custom: true,
			schema: {
				type: "number",
				custom: "com.atlassian.jira.plugins.jira-software-plugin:jsw-story-points",
				customId: 10016,
			},
		},
		{
			id: "customfield_10040",
			name: "Estimated Story Points",
			custom: true,
			schema: {
				type: "number",
				custom: "com.atlassian.jira.plugin.system.customfieldtypes:float",
				customId: 10040,
			},
		},
		{
			id: "customfield_10041",
			name: "Actual Story Points",
			custom: true,
			schema: {
				type: "number",
				custom: "com.atlassian.jira.plugin.system.customfieldtypes:float",
				customId: 10041,
			},
		},
		{ id: "thumbnail", name: "Images", custom: false },
	],
};

const TYPES = "/rest/api/3/issue/createmeta/PROJ/issuetypes?startAt=0&maxResults=200";
const FORM = "/rest/api/3/issue/createmeta/PROJ/issuetypes/10001?startAt=0&maxResults=200";

const CREATE_META = {
	[TYPES]: {
		total: 1,
		issueTypes: [{ id: "10001", name: "Bug", description: "A problem", subtask: false }],
	},
	[FORM]: {
		total: 1,
		fields: [
			{ fieldId: "summary", name: "Summary", required: true, schema: { type: "string" } },
		],
	},
};

test("jira fields: with no project lists every site field by name with its short type", async () => {
	const env = fakeJiraEnv({ getJson: routed(SITE) });
	await jiraFields(env, undefined, undefined, {});

	expect(env.term.written).toEqual([
		[
			"customfield_10041  Actual Story Points     float",
			"customfield_10040  Estimated Story Points  float",
			"thumbnail          Images",
			"customfield_10020  Sprint                  gh-sprint",
			"customfield_10016  Story point estimate    jsw-story-points",
			"customfield_10035  Story Points            float",
			"summary            Summary                 string",
		].join("\n"),
	]);
	expect(env.term.errors).toEqual([]);
});

test("jira fields: --search keeps fields whose name contains the text, ignoring case", async () => {
	const env = fakeJiraEnv({ getJson: routed(SITE) });
	await jiraFields(env, undefined, undefined, { search: "POINT" });

	expect(env.term.written).toEqual([
		[
			"customfield_10041  Actual Story Points     float",
			"customfield_10040  Estimated Story Points  float",
			"customfield_10016  Story point estimate    jsw-story-points",
			"customfield_10035  Story Points            float",
		].join("\n"),
	]);
});

test("jira fields: --search also matches on the field id", async () => {
	const env = fakeJiraEnv({ getJson: routed(SITE) });
	await jiraFields(env, undefined, undefined, { search: "CustomField_10020" });

	expect(env.term.written).toEqual(["customfield_10020  Sprint  gh-sprint"]);
});

test("jira fields: a search with no matches says so", async () => {
	const env = fakeJiraEnv({ getJson: routed(SITE) });
	await jiraFields(env, undefined, undefined, { search: "velocity" });

	expect(env.term.written).toEqual(["No matching fields."]);
});

test("jira fields: --json emits id, name, custom flag and the full schema", async () => {
	const env = fakeJiraEnv({ getJson: routed(SITE) });
	await jiraFields(env, undefined, undefined, { search: "sprint", json: true });

	expect(env.term.emitted).toEqual([
		[
			{
				id: "customfield_10020",
				name: "Sprint",
				custom: true,
				schema: {
					type: "array",
					items: "json",
					custom: "com.pyxis.greenhopper.jira:gh-sprint",
					customId: 10020,
				},
			},
		],
	]);
	expect(env.term.written).toEqual([]);
});

test("jira fields: --json gives a field without a schema a null schema", async () => {
	const env = fakeJiraEnv({ getJson: routed(SITE) });
	await jiraFields(env, undefined, undefined, { search: "thumbnail", json: true });

	expect(env.term.emitted).toEqual([
		[{ id: "thumbnail", name: "Images", custom: false, schema: null }],
	]);
});

test("jira fields <project> still lists the issue types a project offers", async () => {
	const env = fakeJiraEnv({ getJson: routed(CREATE_META) });
	await jiraFields(env, "proj", undefined, {});

	expect(env.term.written).toEqual(["Bug  A problem"]);
});

test("jira fields <project> <type> still shows the create form for that type", async () => {
	const env = fakeJiraEnv({ getJson: routed(CREATE_META) });
	await jiraFields(env, "PROJ", "bug", { json: true });

	expect(env.term.emitted).toEqual([
		[
			{
				fieldId: "summary",
				name: "Summary",
				required: true,
				schema: { type: "string" },
			},
		],
	]);
});

test("jira fields: --search with a project is rejected before any request", async () => {
	const env = fakeJiraEnv({ getJson: routed({}) });

	await expect(jiraFields(env, "PROJ", undefined, { search: "point" })).rejects.toThrow(
		"--search lists site fields and takes no project. Drop PROJ, or run `atlass jira fields PROJ` alone.",
	);
});
