import { input } from "@inquirer/prompts";

export interface RefKind {
	message: string;
	parse: (raw: string) => string | null;
	notFound: (raw: string) => string;
}

export async function resolveRef(arg: string | undefined, kind: RefKind): Promise<string> {
	const raw = arg ?? (await input({ message: kind.message, required: true }));
	const ref = kind.parse(raw);
	if (!ref) throw new Error(kind.notFound(raw));
	return ref;
}
