import kleur from "kleur";
import { dirname, resolve } from "node:path";

import type { ConfluencePage, PageVersion } from "#/api/confluence-pages.ts";
import type { CopyOptions } from "#/commands/jira.ts";
import type { ViewOptions } from "#/commands/view.ts";
import type { SessionEnv } from "#/env.ts";
import type { Fields } from "#/markdown/frontmatter.ts";
import type { UpdatePlan } from "#/update/plan.ts";

import { listAttachments } from "#/api/confluence-attachments.ts";
import { fetchPage, fetchPageState } from "#/api/confluence-pages.ts";
import { pushPage, statLocalImages } from "#/commands/confluence-push.ts";
import { PAGE_REF } from "#/commands/page-ref.ts";
import { resolveRef } from "#/commands/resolve-ref.ts";
import {
	attachmentSection,
	bodyLines,
	commentSection,
	dateWithAge,
	fieldLines,
	renderedComments,
} from "#/commands/view.ts";
import { planPageCopy } from "#/copy/plan.ts";
import { runCopy } from "#/copy/run.ts";
import { parsePageSource } from "#/markdown/copied-document.ts";
import { rewriteFields } from "#/markdown/frontmatter.ts";
import { planPageUpdate } from "#/update/plan-page.ts";
import { runPlan } from "#/update/run.ts";

export async function confluenceView(
	{ session, term }: SessionEnv,
	arg: string | undefined,
	options: ViewOptions,
): Promise<void> {
	const id = await resolveRef(term.ask, arg, PAGE_REF);
	const page = await fetchPage(session, session.site, id);
	const lines = formatPageView(page, Date.now(), options.allComments ?? false);
	await term.page(lines.join("\n"), { pager: options.pager });
}

export function formatPageView(
	page: ConfluencePage,
	nowMs: number,
	allComments: boolean,
): string[] {
	return [
		kleur.bold(page.title),
		...fieldLines([
			["Space", page.spaceKey],
			["ID", page.id],
			["Version", page.version ? String(page.version) : ""],
			["Author", page.author],
			["Created", dateWithAge(page.createdAt, nowMs)],
			["Updated", dateWithAge(page.updatedAt, nowMs)],
			["URL", page.url],
		]),
		...bodyLines(page.body),
		...commentSection(renderedComments(page.comments), { allComments }),
		...attachmentSection(page.attachments),
	];
}

export async function confluenceCopy(
	env: SessionEnv,
	arg: string | undefined,
	options: CopyOptions,
): Promise<void> {
	const id = await resolveRef(env.term.ask, arg, PAGE_REF);
	await copyPage(env, id, options.out);
}

export interface UpdateOptions {
	title?: boolean;
	message?: string;
	force?: boolean;
	dryRun?: boolean;
}

export async function confluenceUpdate(
	env: SessionEnv,
	arg: string | undefined,
	options: UpdateOptions,
): Promise<void> {
	const { session, term, files } = env;
	const file =
		arg ??
		(await term.ask.text({
			message: "Path to the page Markdown file:",
			flag: "[file]",
			required: true,
		}));
	const raw = await files.readText(file);
	const src = parsePageSource(raw);

	const state = await fetchPageState(session, src.id);
	const attachments = await listAttachments(session, src.id);
	const localImages = await statLocalImages(files, dirname(resolve(file)), src.body);

	const plan = planPageUpdate(src, state, attachments, localImages, options);
	await runPlan(term, plan, options, async () => {
		const version = await pushPage(env, plan, {
			id: src.id,
			nextVersion: state.version + 1,
			message: options.message ?? "Updated via atlass",
		});
		term.out(`Updated page ${src.id} to version ${version.number}.`);
		await files.writeText(file, rewriteFields(raw, pushedFields(plan, version)));
	});
}

function pushedFields(plan: UpdatePlan, version: PageVersion): Fields {
	const fields: Fields = { version: version.number };
	if (version.createdAt) fields["updated"] = version.createdAt;
	if (plan.headline.next !== plan.headline.current) fields["title"] = plan.headline.next;
	return fields;
}

export async function copyPage(
	env: SessionEnv,
	id: string,
	out: string | undefined,
): Promise<void> {
	env.term.err(`Fetching page ${id} ...`);
	const page = await fetchPage(env.session, env.session.site, id);
	await runCopy(env, planPageCopy(page, out));
}
