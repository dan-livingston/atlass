import { checkbox, editor, input, search, select } from "@inquirer/prompts";

import type { AllowedValue, CreateField, JiraUser } from "#/api/jira.ts";
import type { FieldInput } from "#/create/encode.ts";

import { SERVER_FILLED, allowedLabel, isMultiLine } from "#/create/encode.ts";
import { fieldTypeLabel } from "#/create/format.ts";

export interface WalkDeps {
	searchUsers: (query: string) => Promise<JiraUser[]>;
	validate: (field: CreateField, value: string) => Promise<string | true>;
}

const PROMPT_SOURCE = "prompt";

export async function walkFields(meta: CreateField[], deps: WalkDeps): Promise<FieldInput[]> {
	const firstPass = meta.filter((f) => f.required && !SERVER_FILLED.has(f.fieldId));
	const inputs: FieldInput[] = [];
	for (const field of firstPass) {
		const answer = await promptField(field, deps, true);
		if (answer) inputs.push(answer);
	}
	const optional = meta.filter((f) => !firstPass.includes(f) && !SERVER_FILLED.has(f.fieldId));
	if (optional.length === 0) return inputs;
	const chosen = await checkbox({
		message: "Set any optional fields?",
		choices: optional.map((f) => ({
			name: `${f.name}  (${fieldTypeLabel(f.schema)})`,
			value: f.fieldId,
		})),
		pageSize: 15,
	});
	for (const field of optional.filter((f) => chosen.includes(f.fieldId))) {
		const answer = await promptField(field, deps, false);
		if (answer) inputs.push(answer);
	}
	return inputs;
}

async function promptField(
	field: CreateField,
	deps: WalkDeps,
	required: boolean,
): Promise<FieldInput | undefined> {
	const answer = await askValues(field, deps, required);
	if (answer.values.length === 0) return undefined;
	return {
		name: field.fieldId,
		values: answer.values,
		source: PROMPT_SOURCE,
		display: answer.display ?? displayFor(field, answer.values),
	};
}

interface Answer {
	values: string[];
	display?: string;
}

const SKIP = { name: "(skip)", value: "" };

async function askValues(field: CreateField, deps: WalkDeps, required: boolean): Promise<Answer> {
	const { schema } = field;
	const message = `${field.name}:`;
	const options = field.allowedValues ?? [];
	if (schema.type === "option-with-child") return askCascading(field, required);
	if (options.length > 0 && schema.type === "array") {
		const defaults = new Set(defaultIds(field));
		const values = await checkbox({
			message,
			choices: options.map((v) => ({ ...choice(v), checked: defaults.has(v.id ?? "") })),
			required,
			pageSize: 15,
		});
		return { values };
	}
	if (options.length > 0) {
		const choices = options.map(choice);
		const picked = await select({
			message,
			choices: required ? choices : [SKIP, ...choices],
			default: defaultIds(field)[0],
			pageSize: 15,
		});
		return { values: picked ? [picked] : [] };
	}
	if (schema.type === "user") return askUser(field, deps, required);
	if (isMultiLine(schema)) {
		const text = await editor({
			message: `${field.name} (opens your editor, Markdown):`,
			postfix: ".md",
			default: primitiveDefault(field),
			validate: (v) =>
				!required || v.trim().length > 0 ? true : `${field.name} is required.`,
		});
		return { values: text.trim() ? [text] : [] };
	}
	const hint = inputHint(field);
	const text = await input({
		message: hint ? `${field.name} (${hint}):` : message,
		default: primitiveDefault(field),
		validate: async (v) => {
			if (v.trim() === "") return required ? `${field.name} is required.` : true;
			return deps.validate(field, v);
		},
	});
	return { values: text.trim() ? [text] : [] };
}

function choice(v: AllowedValue): { name: string; value: string } {
	return { name: allowedLabel(v), value: v.id ?? allowedLabel(v) };
}

function inputHint(field: CreateField): string | undefined {
	const type = field.schema.type === "array" ? field.schema.items : field.schema.type;
	const list = field.schema.type === "array" ? ", comma separated" : "";
	switch (type) {
		case "date":
			return `YYYY-MM-DD${list}`;
		case "datetime":
			return `ISO 8601${list}`;
		case "number":
			return `number${list}`;
		case "user":
			return `name, email, or me${list}`;
		case "string":
			return list ? "comma separated" : undefined;
		default:
			return fieldTypeLabel(field.schema);
	}
}

function defaultIds(field: CreateField): string[] {
	if (!field.hasDefaultValue || field.defaultValue == null) return [];
	const d = field.defaultValue;
	const list = Array.isArray(d) ? (d as AllowedValue[]) : [d as AllowedValue];
	return list.map((v) => v.id).filter((id): id is string => id !== undefined);
}

function primitiveDefault(field: CreateField): string | undefined {
	const d = field.defaultValue;
	if (!field.hasDefaultValue || d == null) return undefined;
	return typeof d === "string" || typeof d === "number" ? String(d) : undefined;
}

async function askCascading(field: CreateField, required: boolean): Promise<Answer> {
	const options = field.allowedValues ?? [];
	const parentChoices = options.map(choice);
	const parentId = await select({
		message: `${field.name}:`,
		choices: required ? parentChoices : [SKIP, ...parentChoices],
		pageSize: 15,
	});
	if (!parentId) return { values: [] };
	const parent = options.find((v) => v.id === parentId);
	const children = parent?.children ?? [];
	if (children.length === 0) return { values: [parentId] };
	const childId = await select({
		message: `${field.name} > ${allowedLabel(parent!)}:`,
		choices: [{ name: "(none)", value: "" }, ...children.map(choice)],
		pageSize: 15,
	});
	return { values: [childId ? `${parentId} > ${childId}` : parentId] };
}

const ME = { name: "me", value: "me" };
const UNASSIGNED = { name: "(unassigned)", value: "" };

async function askUser(field: CreateField, deps: WalkDeps, required: boolean): Promise<Answer> {
	const fixed = required ? [ME] : [ME, UNASSIGNED];
	const seen = new Map<string, string>();
	const picked = await search({
		message: `${field.name} (type to search):`,
		source: async (term) => {
			if (!term) return fixed;
			const users = await deps.searchUsers(term);
			for (const u of users) seen.set(u.accountId, u.displayName);
			return [
				...fixed,
				...users
					.filter((u) => u.active)
					.map((u) => ({
						name: u.email ? `${u.displayName} <${u.email}>` : u.displayName,
						value: u.accountId,
					})),
			];
		},
		pageSize: 10,
	});
	if (!picked) return { values: [] };
	return { values: [picked], display: seen.get(picked) ?? picked };
}

function displayFor(field: CreateField, values: string[]): string {
	const options = field.allowedValues ?? [];
	if (options.length === 0) {
		return isMultiLine(field.schema) ? summarizeText(values[0] ?? "") : values.join(", ");
	}
	return values
		.map((v) =>
			v
				.split(">")
				.map((part) => {
					const id = part.trim();
					const hit = options.find((o) => o.id === id) ?? findChild(options, id);
					return hit ? allowedLabel(hit) : id;
				})
				.join(" > "),
		)
		.join(", ");
}

function findChild(options: AllowedValue[], id: string): AllowedValue | undefined {
	for (const o of options) {
		const hit = o.children?.find((c) => c.id === id);
		if (hit) return hit;
	}
	return undefined;
}

function summarizeText(text: string): string {
	const lines = text.trim().split(/\r?\n/);
	const first = lines[0] ?? "";
	const more = lines.length - 1;
	return more > 0 ? `${first} (+${more} more lines)` : first;
}
