import type { CreateField, CreateIssueType, FieldSchema } from "#/api/jira-types.ts";

import { allowedLabel } from "#/create/encode-allowed-values.ts";
import { isLabels, isMultiLine } from "#/create/encode.ts";

const SCALAR_LABELS: Record<string, string> = {
	string: "text",
	number: "number",
	date: "date",
	datetime: "datetime",
	option: "option",
	"option-with-child": "cascading option",
	user: "user",
	group: "group",
	priority: "priority",
	issuetype: "issue type",
	project: "project",
	version: "version",
	component: "component",
	issuelink: "issue key",
	securitylevel: "security level",
	timetracking: "time tracking",
};

const PLURAL_LABELS: Record<string, string> = {
	string: "text list",
	option: "options",
	user: "users",
	group: "groups",
	version: "versions",
	component: "components",
};

export function fieldTypeLabel(schema: FieldSchema): string {
	if (isMultiLine(schema)) return "multi-line text";
	if (isLabels(schema)) return "labels";
	if (schema.type === "array") {
		const items = schema.items ?? "string";
		return PLURAL_LABELS[items] ?? `${SCALAR_LABELS[items] ?? items} list`;
	}
	const known = SCALAR_LABELS[schema.type];
	if (known) return known;
	const custom = schema.custom?.split(/[:/]/).pop();
	return custom || schema.type;
}

const ALLOWED_SHOWN = 8;

export function allowedSummary(field: CreateField): string | undefined {
	const options = field.allowedValues ?? [];
	if (options.length === 0) return undefined;
	const shown = options.slice(0, ALLOWED_SHOWN).map(allowedLabel);
	const rest = options.length - shown.length;
	if (rest > 0) shown.push(`+${rest} more`);
	return `allowed: ${shown.join(", ")}`;
}

export function defaultSummary(field: CreateField): string | undefined {
	if (!field.hasDefaultValue || field.defaultValue == null) return undefined;
	return `default: ${valueLabel(field.defaultValue)}`;
}

function valueLabel(value: unknown): string {
	if (Array.isArray(value)) return value.map(valueLabel).join(", ");
	if (typeof value === "object" && value !== null) {
		return allowedLabel(value as Record<string, string>);
	}
	return String(value);
}

const DEDICATED_FLAGS: Record<string, string> = {
	summary: "--summary",
	description: "--description",
	assignee: "--assignee",
	priority: "--priority",
	labels: "--label",
	components: "--component",
	parent: "--parent",
};

export function flagFor(field: CreateField): string {
	return DEDICATED_FLAGS[field.fieldId] ?? "--field";
}

export function formatMissingFields(
	project: string,
	type: string,
	missing: CreateField[],
): string[] {
	const nameWidth = Math.max(...missing.map((f) => f.name.length));
	const idWidth = Math.max(...missing.map((f) => f.fieldId.length + 2));
	const rows = missing.map((f) => {
		const note = allowedSummary(f) ?? fieldTypeLabel(f.schema);
		return `  ${f.name.padEnd(nameWidth)}  ${`(${f.fieldId})`.padEnd(idWidth)} ${note}`;
	});
	const flags = [...new Set(missing.map(flagFor))].join("/");
	return [
		`${project} ${type} needs these fields:`,
		...rows,
		`Pass them with ${flags}, or run \`jira fields ${project} ${type}\` to see the form.`,
	];
}

export function formatFieldRows(fields: CreateField[]): string[] {
	const cells = fields.map((f) => ({
		name: f.name,
		id: f.fieldId,
		type: fieldTypeLabel(f.schema),
		required: f.required ? "required" : "",
		notes: [defaultSummary(f), allowedSummary(f)].filter((n) => n !== undefined),
	}));
	const width = (pick: (c: (typeof cells)[number]) => string) =>
		Math.max(...cells.map((c) => pick(c).length));
	const nameWidth = width((c) => c.name);
	const idWidth = width((c) => c.id);
	const typeWidth = width((c) => c.type);
	const requiredWidth = width((c) => c.required);
	return cells.map((c) =>
		[
			c.name.padEnd(nameWidth),
			c.id.padEnd(idWidth),
			c.type.padEnd(typeWidth),
			c.required.padEnd(requiredWidth),
			...c.notes,
		]
			.join("  ")
			.trimEnd(),
	);
}

export function formatIssueTypeRows(types: CreateIssueType[]): string[] {
	const width = Math.max(...types.map((t) => t.name.length));
	return types.map((t) => {
		const tail = [t.subtask ? "(subtask)" : "", t.description].filter(Boolean).join(" ");
		return `${t.name.padEnd(width)}  ${tail}`.trimEnd();
	});
}
