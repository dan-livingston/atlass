import { dirname, resolve } from "node:path";

import type { CreatedPage } from "#/api/confluence-create.ts";
import type { SessionEnv } from "#/env.ts";
import type { CopiedSource } from "#/markdown/copied-document.ts";
import type { LocalImage } from "#/update/plan-page.ts";

import { createPage, findSpaceId } from "#/api/confluence-create.ts";
import { fetchPage } from "#/api/confluence-pages.ts";
import { pushPage, statLocalImages } from "#/commands/confluence-push.ts";
import { starById } from "#/commands/confluence-star.ts";
import { pageFields } from "#/copy/plan.ts";
import { formatCreatePlan, planPageCreate } from "#/create/page-plan.ts";
import { parseDraft, scalarString, withGeneratedMarker } from "#/markdown/copied-document.ts";
import { rewriteFields, withFields } from "#/markdown/frontmatter.ts";
import { editKeepingLayout } from "#/markdown/text-layout.ts";
import { planPageBody } from "#/update/plan-page.ts";
import { parsePageId } from "#/util/parse.ts";

export interface CreateOptions {
	space?: string;
	parent?: string;
	star?: boolean;
	dryRun?: boolean;
}

export async function confluenceCreate(
	env: SessionEnv,
	arg: string | undefined,
	options: CreateOptions,
): Promise<void> {
	const { session, term, files } = env;
	const file =
		arg ??
		(await term.ask.text({
			message: "Path to the Markdown file:",
			flag: "[file]",
			required: true,
		}));
	const raw = await files.readText(file);
	const draft = parseDraft(raw);
	const existing = scalarString(draft.fields["id"]);
	if (existing) {
		throw new Error(
			`${file} already has page id ${existing}. Use \`atlass confluence update\` instead.`,
		);
	}
	const parent = parentOf(options.parent);
	const space = options.space ?? scalarString(draft.fields["space"]);
	const spaceId = space ? await findSpaceId(session, space) : null;
	const localImages = await statLocalImages(files, dirname(resolve(file)), draft.body);
	const plan = planPageCreate(draft, { space, spaceId, ...parent }, localImages);

	if (options.dryRun) term.out(formatCreatePlan(plan));
	if (plan.refusals.length > 0 || !plan.spaceId) throw new Error(plan.refusals.join("\n"));
	if (options.dryRun) return;
	for (const warning of plan.warnings) term.err(`warning: ${warning}`);

	const created = await createPage(session, { ...plan, spaceId: plan.spaceId });
	const createdFields = { title: plan.title, id: created.id, space, version: created.version };
	await files.writeText(
		file,
		editKeepingLayout(raw, (text) => withGeneratedMarker(withFields(text, createdFields))),
	);
	if (plan.images.some((i) => i.kind === "upload")) {
		await addImages(env, draft, created, localImages);
	}
	const page = await fetchPage(session, session.site, created.id);
	await files.writeText(file, rewriteFields(await files.readText(file), pageFields(page)));
	term.out(`Created page ${page.id} in ${page.spaceKey}: ${page.url}`);
	if (options.star) await starCreated(env, page.id, file);
}

function parentOf(parent: string | undefined): { parentId?: string } {
	if (parent === undefined) return {};
	const parentId = parsePageId(parent);
	if (!parentId) throw new Error(`Could not find a page id in --parent "${parent}".`);
	return { parentId };
}

async function addImages(
	env: SessionEnv,
	draft: CopiedSource,
	created: CreatedPage,
	localImages: LocalImage[],
): Promise<void> {
	const { body, uploads } = planPageBody({ id: created.id, body: draft.body }, [], localImages);
	await pushPage(
		env,
		{ title: draft.title, body, uploads },
		{
			id: created.id,
			nextVersion: created.version + 1,
			message: "Added images via atlass",
		},
	);
}

async function starCreated(env: SessionEnv, id: string, file: string): Promise<void> {
	try {
		await starById(env, id);
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);
		throw new Error(
			`Created page ${id} but could not star it: ${reason}. ` +
				`Run \`atlass confluence star ${file}\`.`,
		);
	}
}
