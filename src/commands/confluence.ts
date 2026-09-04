import kleur from "kleur";
import { basename, dirname, isAbsolute, resolve } from "node:path";

import type { ConfluencePage } from "#/api/confluence-pages.ts";
import type { CopyOptions } from "#/commands/jira.ts";
import type { ViewOptions } from "#/commands/view.ts";
import type { SessionEnv } from "#/env.ts";
import type { Files } from "#/files.ts";
import type { LocalImage } from "#/update/plan-page.ts";

import { imageHrefs } from "#/adf/from-markdown.ts";
import { listAttachments, uploadAttachment } from "#/api/confluence-attachments.ts";
import { fetchPage, fetchPageState, updatePage } from "#/api/confluence-pages.ts";
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
import { planPageUpdate, withUploadedIds } from "#/update/plan-page.ts";
import { runPlan } from "#/update/run.ts";
import { isExternalHref, parsePageId } from "#/util/parse.ts";

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
	{ session, term, files }: SessionEnv,
	arg: string | undefined,
	options: UpdateOptions,
): Promise<void> {
	const file =
		arg ??
		(await term.ask.text({
			message: "Path to the page Markdown file:",
			flag: "[file]",
			required: true,
		}));
	const src = parsePageSource(await files.readText(file));

	const state = await fetchPageState(session, src.id);
	const attachments = await listAttachments(session, src.id);
	const localImages = await statLocalImages(files, dirname(resolve(file)), src.body);

	const plan = planPageUpdate(src, state, attachments, localImages, options);
	await runPlan(term, plan, options, async () => {
		const ids = new Map<string, string>();
		for (const upload of plan.uploads) {
			term.err(`Uploading ${upload.filename} ...`);
			const bytes = await files.readBytes(upload.path);
			ids.set(upload.href, await uploadAttachment(session, src.id, upload.filename, bytes));
		}
		const version = await updatePage(session, src.id, {
			title: plan.headline.next,
			nextVersion: state.version + 1,
			body: withUploadedIds(plan.body, ids),
			message: options.message ?? "Updated via atlass",
		});
		term.out(`Updated page ${src.id} to version ${version}.`);
	});
}

async function statLocalImages(files: Files, dir: string, md: string): Promise<LocalImage[]> {
	const hrefs = imageHrefs(md).filter((href) => !isExternalHref(href));
	return Promise.all(
		hrefs.map(async (href) => {
			const path = isAbsolute(href) ? href : resolve(dir, href);
			return { href, path, filename: basename(path), ...(await fileSize(files, path)) };
		}),
	);
}

async function fileSize(files: Files, path: string): Promise<{ size?: number }> {
	try {
		return { size: await files.size(path) };
	} catch {
		return {};
	}
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

const PAGE_REF = {
	message: "Confluence page id or URL:",
	flag: "[page]",
	parse: parsePageId,
	notFound: (raw: string) => `Could not find a page id in "${raw}".`,
};
