import { expect, test } from "vite-plus/test";

import type { CreateField } from "#/api/jira-types.ts";

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
