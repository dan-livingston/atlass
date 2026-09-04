export function quote(value: string): string {
	return `"${value.replace(/(["\\])/g, "\\$1")}"`;
}

export function values(given: string[] | undefined): string[] {
	return (given ?? []).map((v) => v.trim()).filter((v) => v.length > 0);
}

export function inClause(field: string, given: string[] | undefined): string | null {
	return renderClause(field, values(given).map(quote));
}

export function userClause(field: string, given: string[] | undefined): string | null {
	return renderClause(
		field,
		values(given).map((v) => (v === "me" ? "currentUser()" : quote(v))),
	);
}

function renderClause(field: string, rendered: string[]): string | null {
	if (rendered.length === 0) return null;
	if (rendered.length === 1) return `${field} = ${rendered[0]}`;
	return `${field} in (${rendered.join(", ")})`;
}

export function joinClauses(clauses: (string | null)[], order: string): string {
	return `${clauses.filter((c) => c !== null).join(" AND ")} ORDER BY ${order}`;
}
