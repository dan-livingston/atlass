import type { IssueSummary, SiteField } from "#/api/jira-types.ts";
import type { AtlassianSession } from "#/api/session.ts";

import { listSiteFields } from "#/api/jira-fields.ts";
import { values } from "#/api/query.ts";

export interface FieldColumn {
	name: string;
	id: string;
}

export async function resolveFieldColumns(
	session: AtlassianSession,
	given: string[] | undefined,
): Promise<FieldColumn[]> {
	const names = values(given);
	if (names.length === 0) return [];
	const fields = await listSiteFields(session);
	return names.map((name) => ({ name, id: resolveFieldId(fields, name) }));
}

function resolveFieldId(fields: SiteField[], name: string): string {
	const byId = fields.find((f) => f.id === name);
	if (byId) return byId.id;
	const lower = name.toLowerCase();
	const matches = fields.filter((f) => f.name.toLowerCase() === lower);
	const [only, ...others] = matches;
	if (!only) {
		throw new Error(
			`No field matches "${name}". Run \`atlass jira fields --search ${shellWord(name)}\` to find it.`,
		);
	}
	if (others.length === 0) return only.id;
	const width = Math.max(...matches.map((f) => f.id.length));
	throw new Error(
		[
			`"${name}" matches several fields. Use an id:`,
			...matches.map((f) => `  ${f.id.padEnd(width)}  ${f.name}`),
		].join("\n"),
	);
}

function shellWord(text: string): string {
	return /\s/.test(text) ? `"${text}"` : text;
}

export function fieldIds(columns: FieldColumn[]): string[] {
	return [...new Set(columns.map((c) => c.id))];
}

export function withNamedFields(issues: IssueSummary[], columns: FieldColumn[]): IssueSummary[] {
	if (columns.length === 0) return issues;
	return issues.map((issue) => ({
		...issue,
		fields: Object.fromEntries(columns.map((c) => [c.name, issue.fields?.[c.id] ?? null])),
	}));
}

const EMPTY_CELL = "-";

export function fieldCell(value: unknown): string {
	const parts = Array.isArray(value) ? value.map(shownValue) : [shownValue(value)];
	const text = parts.filter((p) => p !== "").join(", ");
	return text === "" ? EMPTY_CELL : text;
}

function shownValue(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	const named = value as { value?: unknown; displayName?: unknown; name?: unknown };
	const shown = named.value ?? named.displayName ?? named.name;
	return shown === undefined ? JSON.stringify(value) : shownValue(shown);
}
