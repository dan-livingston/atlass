import { expect, test } from "vite-plus/test";

import type { CreateField } from "#/api/jira.ts";

import { encodeCreate } from "#/create/encode.ts";

function field(overrides: Partial<CreateField> & Pick<CreateField, "fieldId">): CreateField {
	return {
		name: overrides.fieldId,
		required: false,
		hasDefaultValue: false,
		schema: { type: "string" },
		...overrides,
	};
}

const noUsers = () => Promise.reject(new Error("no user lookup expected"));

test("required: project, issuetype, reporter and defaulted fields are never reported missing", async () => {
	const meta = [
		field({ fieldId: "project", required: true, schema: { type: "project" } }),
		field({ fieldId: "issuetype", required: true, schema: { type: "issuetype" } }),
		field({ fieldId: "reporter", required: true, schema: { type: "user" } }),
		field({
			fieldId: "priority",
			required: true,
			hasDefaultValue: true,
			schema: { type: "priority" },
		}),
		field({ fieldId: "summary", name: "Summary", required: true }),
		field({ fieldId: "labels", schema: { type: "array", items: "string" } }),
	];
	const result = await encodeCreate(meta, [], noUsers);
	expect(result.missing.map((f) => f.fieldId)).toEqual(["summary"]);
	expect(result.problems).toEqual([]);
	expect(result.fields).toEqual({});
});

test("names: inputs match the display name case-insensitively or the field id exactly", async () => {
	const meta = [
		field({ fieldId: "summary", name: "Summary", required: true }),
		field({ fieldId: "customfield_10011", name: "Severity Notes" }),
	];
	const result = await encodeCreate(
		meta,
		[
			{ name: "summary", values: ["Login is broken"], source: "--summary" },
			{ name: " severity notes ", values: ["S1 seen twice"], source: "--field" },
		],
		noUsers,
	);
	expect(result.fields).toEqual({
		summary: "Login is broken",
		customfield_10011: "S1 seen twice",
	});
	expect(result.missing).toEqual([]);
});

test("names: a field not on the create screen is a problem", async () => {
	const meta = [field({ fieldId: "summary", name: "Summary" })];
	const result = await encodeCreate(
		meta,
		[{ name: "Story Points", values: ["3"], source: "--field" }],
		noUsers,
	);
	expect(result.problems).toEqual(['"Story Points" is not on this create screen.']);
});

test("names: a duplicated display name needs the field id", async () => {
	const meta = [
		field({ fieldId: "customfield_1", name: "Team" }),
		field({ fieldId: "customfield_2", name: "Team" }),
	];
	const byName = await encodeCreate(
		meta,
		[{ name: "team", values: ["a"], source: "--field" }],
		noUsers,
	);
	expect(byName.problems).toEqual([
		'"team" matches more than one field; use the id: customfield_1, customfield_2.',
	]);
	const byId = await encodeCreate(
		meta,
		[{ name: "customfield_2", values: ["a"], source: "--field" }],
		noUsers,
	);
	expect(byId.fields).toEqual({ customfield_2: "a" });
});

test("names: the same field from two flags is a problem, from one flag repeated it appends", async () => {
	const meta = [
		field({ fieldId: "labels", name: "Labels", schema: { type: "array", items: "string" } }),
	];
	const twoFlags = await encodeCreate(
		meta,
		[
			{ name: "labels", values: ["a"], source: "--label" },
			{ name: "Labels", values: ["b"], source: "--field" },
		],
		noUsers,
	);
	expect(twoFlags.problems).toEqual(["Labels was given by both --label and --field."]);
	const repeated = await encodeCreate(
		meta,
		[
			{ name: "labels", values: ["a"], source: "--field" },
			{ name: "Labels", values: ["b"], source: "--field" },
		],
		noUsers,
	);
	expect(repeated.fields).toEqual({ labels: ["a", "b"] });
});

test("values: a single-value field rejects more than one value", async () => {
	const meta = [field({ fieldId: "summary", name: "Summary" })];
	const result = await encodeCreate(
		meta,
		[{ name: "summary", values: ["a", "b"], source: "--field" }],
		noUsers,
	);
	expect(result.problems).toEqual(["Summary takes one value."]);
});

const SEVERITY = field({
	fieldId: "customfield_10011",
	name: "Severity",
	schema: { type: "option", custom: "com.atlassian.jira.plugin.system.customfieldtypes:select" },
	allowedValues: [
		{ id: "10200", value: "S1" },
		{ id: "10201", value: "S2" },
	],
});

const COMPONENTS = field({
	fieldId: "components",
	name: "Components",
	schema: { type: "array", items: "component", system: "components" },
	allowedValues: [
		{ id: "10100", name: "API" },
		{ id: "10101", name: "Web" },
	],
});

test("allowed values: tokens match value or name case-insensitively, or the id, and send the id", async () => {
	const result = await encodeCreate(
		[
			SEVERITY,
			COMPONENTS,
			field({
				fieldId: "priority",
				name: "Priority",
				schema: { type: "priority" },
				allowedValues: [{ id: "2", name: "High" }],
			}),
		],
		[
			{ name: "severity", values: ["s2"], source: "--field" },
			{ name: "components", values: ["api, WEB"], source: "--component" },
			{ name: "priority", values: ["2"], source: "--priority" },
		],
		noUsers,
	);
	expect(result.fields).toEqual({
		customfield_10011: { id: "10201" },
		components: [{ id: "10100" }, { id: "10101" }],
		priority: { id: "2" },
	});
});

test("allowed values: an unknown token lists what is allowed", async () => {
	const result = await encodeCreate(
		[SEVERITY],
		[{ name: "severity", values: ["S9"], source: "--field" }],
		noUsers,
	);
	expect(result.problems).toEqual(['Severity has no value "S9"; allowed: S1, S2.']);
});

test("cascading select: Parent > Child sends both ids", async () => {
	const meta = [
		field({
			fieldId: "customfield_20",
			name: "Area",
			schema: { type: "option-with-child", custom: "...:cascadingselect" },
			allowedValues: [
				{ id: "1", value: "Backend", children: [{ id: "11", value: "Auth" }] },
				{ id: "2", value: "Frontend" },
			],
		}),
	];
	const ok = await encodeCreate(
		meta,
		[{ name: "area", values: ["backend > auth"], source: "--field" }],
		noUsers,
	);
	expect(ok.fields).toEqual({ customfield_20: { id: "1", child: { id: "11" } } });
	const parentOnly = await encodeCreate(
		meta,
		[{ name: "area", values: ["Frontend"], source: "--field" }],
		noUsers,
	);
	expect(parentOnly.fields).toEqual({ customfield_20: { id: "2" } });
	const badChild = await encodeCreate(
		meta,
		[{ name: "area", values: ["Backend > Db"], source: "--field" }],
		noUsers,
	);
	expect(badChild.problems).toEqual(['Area has no value "Db" under Backend; allowed: Auth.']);
});

test("scalars: numbers, dates and datetimes are validated", async () => {
	const meta = [
		field({ fieldId: "customfield_1", name: "Points", schema: { type: "number" } }),
		field({ fieldId: "duedate", name: "Due date", schema: { type: "date" } }),
		field({ fieldId: "customfield_2", name: "Starts", schema: { type: "datetime" } }),
	];
	const ok = await encodeCreate(
		meta,
		[
			{ name: "points", values: ["2.5"], source: "--field" },
			{ name: "due date", values: ["2026-09-30"], source: "--field" },
			{ name: "starts", values: ["2026-09-02T10:00:00+02:00"], source: "--field" },
		],
		noUsers,
	);
	expect(ok.fields["customfield_1"]).toBe(2.5);
	expect(ok.fields["duedate"]).toBe("2026-09-30");
	const starts = ok.fields["customfield_2"] as string;
	expect(starts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{4}$/);
	expect(Date.parse(starts)).toBe(Date.parse("2026-09-02T10:00:00+02:00"));

	const bad = await encodeCreate(
		meta,
		[
			{ name: "points", values: ["many"], source: "--field" },
			{ name: "due date", values: ["30/09/2026"], source: "--field" },
			{ name: "starts", values: ["tomorrow"], source: "--field" },
		],
		noUsers,
	);
	expect(bad.problems).toEqual([
		'Points must be a number, not "many".',
		'Due date must be YYYY-MM-DD, not "30/09/2026".',
		'Starts must be an ISO 8601 datetime, not "tomorrow".',
	]);
});

test("labels: comma separated, spaces rejected", async () => {
	const meta = [
		field({
			fieldId: "labels",
			name: "Labels",
			schema: { type: "array", items: "string", system: "labels" },
		}),
	];
	const ok = await encodeCreate(
		meta,
		[{ name: "labels", values: ["a,b"], source: "--label" }],
		noUsers,
	);
	expect(ok.fields).toEqual({ labels: ["a", "b"] });
	const bad = await encodeCreate(
		meta,
		[{ name: "labels", values: ["needs triage"], source: "--label" }],
		noUsers,
	);
	expect(bad.problems).toEqual(['Labels cannot contain spaces: "needs triage".']);
});

test("multi-line text: description and textarea fields are Markdown rendered to ADF", async () => {
	const meta = [
		field({
			fieldId: "description",
			name: "Description",
			schema: { type: "string", system: "description" },
		}),
		field({
			fieldId: "customfield_3",
			name: "Steps",
			schema: {
				type: "string",
				custom: "com.atlassian.jira.plugin.system.customfieldtypes:textarea",
			},
		}),
		field({
			fieldId: "customfield_4",
			name: "Ref",
			schema: {
				type: "string",
				custom: "com.atlassian.jira.plugin.system.customfieldtypes:textfield",
			},
		}),
	];
	const result = await encodeCreate(
		meta,
		[
			{ name: "description", values: ["Hello **world**"], source: "--description" },
			{ name: "steps", values: ["1. one"], source: "--field" },
			{ name: "ref", values: ["**plain**"], source: "--field" },
		],
		noUsers,
	);
	expect(result.fields["description"]).toEqual({
		type: "doc",
		version: 1,
		content: [
			{
				type: "paragraph",
				content: [
					{ type: "text", text: "Hello " },
					{ type: "text", text: "world", marks: [{ type: "strong" }] },
				],
			},
		],
	});
	expect((result.fields["customfield_3"] as { type: string }).type).toBe("doc");
	expect(result.fields["customfield_4"]).toBe("**plain**");
});

test("users: single and multi user fields go through the resolver and send accountId", async () => {
	const meta = [
		field({
			fieldId: "assignee",
			name: "Assignee",
			schema: { type: "user", system: "assignee" },
		}),
		field({
			fieldId: "customfield_5",
			name: "Watchers",
			schema: { type: "array", items: "user" },
		}),
	];
	const resolve = async (q: string) => `id-${q}`;
	const result = await encodeCreate(
		meta,
		[
			{ name: "assignee", values: ["me"], source: "--assignee" },
			{ name: "watchers", values: ["ann, bob"], source: "--field" },
		],
		resolve,
	);
	expect(result.fields).toEqual({
		assignee: { accountId: "id-me" },
		customfield_5: [{ accountId: "id-ann" }, { accountId: "id-bob" }],
	});
});

test("users: a resolver failure becomes a problem on that field", async () => {
	const meta = [field({ fieldId: "assignee", name: "Assignee", schema: { type: "user" } })];
	const result = await encodeCreate(
		meta,
		[{ name: "assignee", values: ["dan"], source: "--assignee" }],
		() => Promise.reject(new Error("matches 2 users: Dan A, Dan B")),
	);
	expect(result.problems).toEqual(["Assignee: matches 2 users: Dan A, Dan B"]);
});

test("other shapes: parent by key, groups by name, unknown types take JSON or a raw string", async () => {
	const meta = [
		field({
			fieldId: "parent",
			name: "Parent",
			schema: { type: "issuelink", system: "parent" },
		}),
		field({ fieldId: "customfield_6", name: "Team", schema: { type: "group" } }),
		field({
			fieldId: "customfield_7",
			name: "Approvers",
			schema: { type: "array", items: "group" },
		}),
		field({
			fieldId: "customfield_8",
			name: "Sprint",
			schema: { type: "any", custom: "com.pyxis.greenhopper.jira:gh-sprint" },
		}),
		field({ fieldId: "customfield_9", name: "Asset", schema: { type: "any" } }),
	];
	const result = await encodeCreate(
		meta,
		[
			{ name: "parent", values: ["bsc-12"], source: "--parent" },
			{ name: "team", values: ["jira-devs"], source: "--field" },
			{ name: "approvers", values: ["a,b"], source: "--field" },
			{ name: "sprint", values: ["42"], source: "--field" },
			{ name: "asset", values: ['[{"key":"X-1"}]'], source: "--field" },
		],
		noUsers,
	);
	expect(result.fields).toEqual({
		parent: { key: "BSC-12" },
		customfield_6: { name: "jira-devs" },
		customfield_7: [{ name: "a" }, { name: "b" }],
		customfield_8: "42",
		customfield_9: [{ key: "X-1" }],
	});
});

test("datetime: only ISO 8601 shapes are accepted, not whatever Date.parse tolerates", async () => {
	const meta = [
		field({ fieldId: "customfield_2", name: "Starts", schema: { type: "datetime" } }),
	];
	const encode = (v: string) =>
		encodeCreate(meta, [{ name: "starts", values: [v], source: "--field" }], noUsers);
	expect((await encode("2026-09-02T10:00")).problems).toEqual([]);
	expect((await encode("2026-09-02T10:00:00Z")).problems).toEqual([]);
	expect((await encode("2026-09-02")).problems).toEqual([
		'Starts must be an ISO 8601 datetime, not "2026-09-02".',
	]);
	expect((await encode("Sep 2 2026")).problems).toEqual([
		'Starts must be an ISO 8601 datetime, not "Sep 2 2026".',
	]);
});

test("named types without allowed values are sent by name or value rather than as raw strings", async () => {
	const meta = [
		field({ fieldId: "priority", name: "Priority", schema: { type: "priority" } }),
		field({ fieldId: "customfield_1", name: "Flavour", schema: { type: "option" } }),
		field({
			fieldId: "fixVersions",
			name: "Fix versions",
			schema: { type: "array", items: "version" },
		}),
	];
	const result = await encodeCreate(
		meta,
		[
			{ name: "priority", values: ["High"], source: "--priority" },
			{ name: "flavour", values: ["Mint"], source: "--field" },
			{ name: "fix versions", values: ["1.0, 1.1"], source: "--field" },
		],
		noUsers,
	);
	expect(result.fields).toEqual({
		priority: { name: "High" },
		customfield_1: { value: "Mint" },
		fixVersions: [{ name: "1.0" }, { name: "1.1" }],
	});
});
