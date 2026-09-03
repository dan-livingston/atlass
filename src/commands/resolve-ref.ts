import type { Prompts } from "#/terminal.ts";

export interface RefKind {
	message: string;
	flag?: string;
	parse: (raw: string) => string | null;
	notFound: (raw: string) => string;
}

export async function resolveRef(
	ask: Prompts,
	arg: string | undefined,
	kind: RefKind,
): Promise<string> {
	const raw = arg ?? (await ask.text({ message: kind.message, flag: kind.flag, required: true }));
	const ref = kind.parse(raw);
	if (!ref) throw new Error(kind.notFound(raw));
	return ref;
}
