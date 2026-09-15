import type { Env } from "#/env.ts";

import { resolveRef } from "#/commands/resolve-ref.ts";
import { parse, scalarString } from "#/markdown/copied-document.ts";
import { parsePageId } from "#/util/parse.ts";

export const PAGE_REF = {
	message: "Confluence page id or URL:",
	flag: "[page]",
	parse: parsePageId,
	notFound: (raw: string) => `Could not find a page id in "${raw}".`,
};

export async function pageIdOrFile({ term, files }: Env, arg: string | undefined): Promise<string> {
	if (!arg?.endsWith(".md")) return resolveRef(term.ask, arg, PAGE_REF);
	const id = scalarString(parse(await files.readText(arg)).fields["id"]);
	if (!id) throw new Error(`${arg} has no page \`id\` in its frontmatter.`);
	return id;
}
