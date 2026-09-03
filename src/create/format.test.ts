import { expect, test } from "vite-plus/test";

import type { CreateField } from "#/api/jira.ts";

import {
	fieldTypeLabel,
	formatFieldRows,
	formatIssueTypeRows,
	formatMissingFields,
} from "#/create/format.ts";

function field(overrides: Partial<CreateField> & Pick<CreateField, "fieldId">): CreateField {
	return {
		name: overrides.fieldId,
		required: false,
		hasDefaultValue: false,
		schema: { type: "string" },
		...overrides,
	};
}

test("type label: reads the schema type, items, and multi-line hint", () => {
	expect(fieldTypeLabel({ type: "string" })).toBe("text");
	expect(fieldTypeLabel({ type: "string", system: "description" })).toBe("multi-line text");
	expect(fieldTypeLabel({ type: "array", items: "component" })).toBe("components");
	expect(fieldTypeLabel({ type: "array", items: "string", system: "labels" })).toBe("labels");
	expect(fieldTypeLabel({ type: "option" })).toBe("option");
	expect(fieldTypeLabel({ type: "array", items: "option" })).toBe("options");
	expect(fieldTypeLabel({ type: "option-with-child" })).toBe("cascading option");
	expect(fieldTypeLabel({ type: "user" })).toBe("user");
	expect(fieldTypeLabel({ type: "array", items: "user" })).toBe("users");
	expect(fieldTypeLabel({ type: "issuelink", system: "parent" })).toBe("issue key");
	expect(fieldTypeLabel({ type: "any", custom: "com.pyxis.greenhopper.jira:gh-sprint" })).toBe(
		"gh-sprint",
	);
});

test("missing block: names the form, aligns columns, shows allowed values or the type, and hints flags", () => {
	const lines = formatMissingFields("BSC", "Defect", [
		field({
			fieldId: "components",
			name: "Components",
			schema: { type: "array", items: "component" },
			allowedValues: [
				{ id: "1", name: "API" },
				{ id: "2", name: "Web" },
			],
		}),
		field({
			fieldId: "customfield_10011",
			name: "Severity",
			schema: { type: "option" },
			allowedValues: [
				{ id: "1", value: "S1" },
				{ id: "2", value: "S2" },
			],
		}),
		field({
			fieldId: "environment",
			name: "Environment",
			schema: { type: "string", system: "environment" },
		}),
	]);
	expect(lines).toEqual([
		"BSC Defect needs these fields:",
		"  Components   (components)        allowed: API, Web",
		"  Severity     (customfield_10011) allowed: S1, S2",
		"  Environment  (environment)       multi-line text",
		"Pass them with --component/--field, or run `jira fields BSC Defect` to see the form.",
	]);
});

test("missing block: long allowed lists are truncated with a count", () => {
	const options = Array.from({ length: 11 }, (_, i) => ({ id: String(i), value: `v${i}` }));
	const lines = formatMissingFields("BSC", "Defect", [
		field({
			fieldId: "customfield_1",
			name: "Pick",
			schema: { type: "option" },
			allowedValues: options,
		}),
	]);
	expect(lines[1]).toBe(
		"  Pick  (customfield_1) allowed: v0, v1, v2, v3, v4, v5, v6, v7, +3 more",
	);
});

test("field rows: name, id, type, required marker, default and allowed values", () => {
	const lines = formatFieldRows([
		field({ fieldId: "summary", name: "Summary", required: true }),
		field({
			fieldId: "priority",
			name: "Priority",
			required: true,
			hasDefaultValue: true,
			defaultValue: { id: "3", name: "Medium" },
			schema: { type: "priority" },
			allowedValues: [
				{ id: "2", name: "High" },
				{ id: "3", name: "Medium" },
			],
		}),
		field({
			fieldId: "labels",
			name: "Labels",
			schema: { type: "array", items: "string", system: "labels" },
		}),
	]);
	expect(lines).toEqual([
		"Summary   summary   text      required",
		"Priority  priority  priority  required  default: Medium  allowed: High, Medium",
		"Labels    labels    labels",
	]);
});

test("issue type rows: name padded, subtasks marked, description after", () => {
	expect(
		formatIssueTypeRows([
			{ id: "1", name: "Bug", description: "An error in the code", subtask: false },
			{ id: "2", name: "Sub-task", description: "", subtask: true },
		]),
	).toEqual(["Bug       An error in the code", "Sub-task  (subtask)"]);
});
