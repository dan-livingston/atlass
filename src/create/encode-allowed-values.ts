import type { AllowedValue, CreateField } from "#/api/jira-types.ts";
import type { Encoded } from "#/create/encode.ts";

export function allowedLabel(v: AllowedValue): string {
	return v.value ?? v.name ?? v.key ?? v.id ?? "";
}

function findAllowed(options: AllowedValue[], token: string): AllowedValue | undefined {
	const needle = token.toLowerCase();
	return (
		options.find((v) => v.id === token) ??
		options.find((v) => allowedLabel(v).toLowerCase() === needle)
	);
}

function allowedList(options: AllowedValue[]): string {
	return options.map(allowedLabel).join(", ");
}

export function matchAllowed(field: CreateField, token: string): Encoded {
	const options = field.allowedValues ?? [];
	const hit = findAllowed(options, token);
	if (!hit) {
		return {
			problem: `${field.name} has no value "${token}"; allowed: ${allowedList(options)}.`,
		};
	}
	return { value: { id: hit.id } };
}

export function matchCascading(field: CreateField, value: string): Encoded {
	const options = field.allowedValues ?? [];
	const [parentText = "", childText] = value.split(">").map((s) => s.trim());
	const parent = findAllowed(options, parentText);
	if (!parent) {
		return {
			problem: `${field.name} has no value "${parentText}"; allowed: ${allowedList(options)}.`,
		};
	}
	if (!childText) return { value: { id: parent.id } };
	const children = parent.children ?? [];
	const child = findAllowed(children, childText);
	if (!child) {
		const under = allowedLabel(parent);
		return {
			problem: `${field.name} has no value "${childText}" under ${under}; allowed: ${allowedList(children)}.`,
		};
	}
	return { value: { id: parent.id, child: { id: child.id } } };
}
