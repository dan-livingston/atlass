import type { CreateField, FieldSchema } from "#/api/jira-types.ts";

import { markdownToAdf } from "#/adf/from-markdown.ts";
import { matchAllowed, matchCascading } from "#/create/encode-allowed-values.ts";

export interface FieldInput {
	name: string;
	values: string[];
	source: string;
	display?: string;
}

export interface EncodeResult {
	fields: Record<string, unknown>;
	missing: CreateField[];
	problems: string[];
}

export type ResolveUser = (query: string) => Promise<string>;

export const SERVER_FILLED = new Set(["project", "issuetype", "reporter"]);

export function requiredFields(meta: CreateField[]): CreateField[] {
	return meta.filter((f) => f.required && !f.hasDefaultValue && !SERVER_FILLED.has(f.fieldId));
}

export type FieldMatch = { field: CreateField } | { ambiguous: CreateField[] } | { unknown: true };

export function findField(meta: CreateField[], name: string): FieldMatch {
	const needle = name.trim().toLowerCase();
	const byId = meta.find((f) => f.fieldId === name.trim());
	if (byId) return { field: byId };
	const byName = meta.filter((f) => f.name.toLowerCase() === needle);
	if (byName.length === 1) return { field: byName[0]! };
	if (byName.length > 1) return { ambiguous: byName };
	return { unknown: true };
}

interface Assignment {
	field: CreateField;
	values: string[];
	source: string;
}

function assign(meta: CreateField[], inputs: FieldInput[], problems: string[]): Assignment[] {
	const byField = new Map<string, Assignment>();
	for (const input of inputs) {
		const match = findField(meta, input.name);
		if ("unknown" in match) {
			problems.push(`"${input.name.trim()}" is not on this create screen.`);
			continue;
		}
		if ("ambiguous" in match) {
			const ids = match.ambiguous.map((f) => f.fieldId).join(", ");
			problems.push(
				`"${input.name.trim()}" matches more than one field; use the id: ${ids}.`,
			);
			continue;
		}
		const existing = byField.get(match.field.fieldId);
		if (!existing) {
			byField.set(match.field.fieldId, {
				field: match.field,
				values: [...input.values],
				source: input.source,
			});
		} else if (existing.source !== input.source) {
			problems.push(
				`${match.field.name} was given by both ${existing.source} and ${input.source}.`,
			);
		} else {
			existing.values.push(...input.values);
		}
	}
	return [...byField.values()];
}

export async function encodeCreate(
	meta: CreateField[],
	inputs: FieldInput[],
	resolveUser: ResolveUser,
): Promise<EncodeResult> {
	const problems: string[] = [];
	const fields: Record<string, unknown> = {};
	const assignments = assign(meta, inputs, problems);
	for (const a of assignments) {
		const encoded = await encodeField(a.field, a.values, resolveUser);
		if ("problem" in encoded) problems.push(encoded.problem);
		else fields[a.field.fieldId] = encoded.value;
	}
	const set = new Set(assignments.map((a) => a.field.fieldId));
	const missing = requiredFields(meta).filter((f) => !set.has(f.fieldId));
	return { fields, missing, problems };
}

export type Encoded = { value: unknown } | { problem: string };

export function isMultiLine(schema: FieldSchema): boolean {
	return (
		schema.system === "description" ||
		schema.system === "environment" ||
		(schema.custom?.endsWith(":textarea") ?? false)
	);
}

export function isLabels(schema: FieldSchema): boolean {
	return schema.system === "labels" || (schema.custom?.endsWith(":labels") ?? false);
}

async function encodeField(
	field: CreateField,
	values: string[],
	resolveUser: ResolveUser,
): Promise<Encoded> {
	const { schema } = field;
	if (schema.type === "array") {
		const items = schema.items ?? "string";
		const out: unknown[] = [];
		for (const token of splitCommas(values)) {
			const encoded = await encodeScalar(field, items, token, resolveUser);
			if ("problem" in encoded) return encoded;
			out.push(encoded.value);
		}
		return { value: out };
	}
	if (values.length !== 1) return { problem: `${field.name} takes one value.` };
	return encodeScalar(field, schema.type, values[0]!, resolveUser);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/i;
const NAMED_TYPES = new Set(["priority", "version", "component", "securitylevel", "issuetype"]);

async function encodeScalar(
	field: CreateField,
	type: string,
	raw: string,
	resolveUser: ResolveUser,
): Promise<Encoded> {
	const fail = (text: string): Encoded => ({ problem: `${field.name} ${text}` });
	const token = raw.trim();
	const { schema } = field;
	if (type === "option-with-child") return matchCascading(field, token);
	if (field.allowedValues && field.allowedValues.length > 0) return matchAllowed(field, token);
	switch (type) {
		case "string":
			if (isMultiLine(schema)) return { value: markdownToAdf(raw) };
			if (isLabels(schema) && /\s/.test(token)) {
				return fail(`cannot contain spaces: "${token}".`);
			}
			return { value: schema.type === "array" ? token : raw };
		case "number": {
			const n = Number(token);
			if (token === "" || Number.isNaN(n)) return fail(`must be a number, not "${token}".`);
			return { value: n };
		}
		case "date":
			if (!DATE.test(token)) return fail(`must be YYYY-MM-DD, not "${token}".`);
			return { value: token };
		case "datetime": {
			const ms = DATETIME.test(token) ? Date.parse(token) : Number.NaN;
			if (Number.isNaN(ms)) return fail(`must be an ISO 8601 datetime, not "${token}".`);
			return { value: formatJiraDateTime(new Date(ms)) };
		}
		case "option":
			return { value: { value: token } };
		case "project":
			return { value: { key: token.toUpperCase() } };
		case "user":
			try {
				return { value: { accountId: await resolveUser(token) } };
			} catch (err) {
				return {
					problem: `${field.name}: ${err instanceof Error ? err.message : String(err)}`,
				};
			}
		case "group":
			return { value: { name: token } };
		case "issuelink":
			return { value: { key: token.toUpperCase() } };
		default:
			if (NAMED_TYPES.has(type)) return { value: { name: token } };
			return { value: looseValue(raw) };
	}
}

function looseValue(raw: string): unknown {
	const trimmed = raw.trim();
	if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return raw;
	try {
		return JSON.parse(trimmed) as unknown;
	} catch {
		return raw;
	}
}

export function formatJiraDateTime(date: Date): string {
	const pad = (n: number, width = 2) => String(n).padStart(width, "0");
	const offsetMinutes = -date.getTimezoneOffset();
	const sign = offsetMinutes < 0 ? "-" : "+";
	const abs = Math.abs(offsetMinutes);
	const ymd = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
	const hms = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
	const offset = `${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`;
	return `${ymd}T${hms}.${pad(date.getMilliseconds(), 3)}${offset}`;
}

function splitCommas(values: string[]): string[] {
	return values
		.flatMap((v) => v.split(","))
		.map((v) => v.trim())
		.filter((v) => v.length > 0);
}
