import kleur from "kleur";
import { readFile, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";

import type { ConfluencePage } from "#/api/confluence-pages.ts";
import type { PageSearchParams, PageSummary } from "#/api/confluence-search.ts";
import type { CopyOptions } from "#/commands/jira.ts";
import type { SearchRow } from "#/commands/search-run.ts";
import type { ViewOptions } from "#/commands/view.ts";
import type { Env } from "#/env.ts";
import type { LocalImage } from "#/update/plan-page.ts";

import { imageHrefs } from "#/adf/from-markdown.ts";
import { listAttachments, uploadAttachment } from "#/api/confluence-attachments.ts";
import { fetchPage, fetchPageState, updatePage } from "#/api/confluence-pages.ts";
import { searchPages } from "#/api/confluence-search.ts";
import { resolveRef } from "#/commands/resolve-ref.ts";
import { alignedRows, runSearch, searchFooter } from "#/commands/search-run.ts";
import {
	attachmentSection,
	bodyLines,
	commentSection,
	dateWithAge,
	fieldLines,
} from "#/commands/view.ts";
import { planPageCopy } from "#/copy/plan.ts";
import { runCopy } from "#/copy/run.ts";
import { parsePageSource } from "#/markdown/copied-document.ts";
import { planPageUpdate, withUploadedIds } from "#/update/plan-page.ts";
import { runPlan } from "#/update/run.ts";
import { isExternalHref, parseLimit, parsePageId } from "#/util/parse.ts";

export interface SearchOptions {
	space?: string;
	cql?: string;
	limit?: string;
	json?: boolean;
	copy?: boolean;
	out?: string;
}

export async function confluenceView(
	{ session, term }: Env,
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
		...commentSection(page.comments, allComments),
		...attachmentSection(page.attachments),
	];
}

export async function confluenceCopy(
	env: Env,
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
	{ session, term }: Env,
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
	const src = parsePageSource(await readFile(file, "utf8"));

	const state = await fetchPageState(session, src.id);
	const attachments = await listAttachments(session, src.id);
	const localImages = await statLocalImages(dirname(resolve(file)), src.body);

	const plan = planPageUpdate(src, state, attachments, localImages, options);
	await runPlan(term, plan, options, async () => {
		const ids = new Map<string, string>();
		for (const upload of plan.uploads) {
			term.err(`Uploading ${upload.filename} ...`);
			const bytes = await readFile(upload.path);
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

async function statLocalImages(dir: string, md: string): Promise<LocalImage[]> {
	const hrefs = imageHrefs(md).filter((href) => !isExternalHref(href));
	return Promise.all(
		hrefs.map(async (href) => {
			const path = isAbsolute(href) ? href : resolve(dir, href);
			return { href, path, filename: basename(path), ...(await fileSize(path)) };
		}),
	);
}

async function fileSize(path: string): Promise<{ size?: number }> {
	try {
		return { size: (await stat(path)).size };
	} catch {
		return {};
	}
}

export async function confluenceSearch(
	env: Env,
	query: string | undefined,
	options: SearchOptions,
): Promise<void> {
	if (options.cql && (query || options.space)) {
		throw new Error("--cql cannot be combined with a text query or --space.");
	}
	await listPages(
		env,
		{ text: query, space: options.space, cql: options.cql },
		"No matching pages.",
		options,
	);
}

export type ListOptions = Omit<SearchOptions, "cql">;

export async function confluenceList(env: Env, options: ListOptions): Promise<void> {
	await listPages(
		env,
		{ starred: true, space: options.space },
		options.space ? `No starred pages in ${options.space}.` : "No starred pages.",
		options,
	);
}

async function listPages(
	env: Env,
	filter: Omit<PageSearchParams, "limit">,
	empty: string,
	options: ListOptions,
): Promise<void> {
	const { session, term } = env;
	if (options.json && options.copy) {
		throw new Error("--json and --copy cannot be used together.");
	}

	const limit = parseLimit(options.limit);
	const { pages, hasMore } = await searchPages(session, session.site, { ...filter, limit });

	await runSearch(
		term,
		formatPageRows(pages, Date.now()),
		{
			json: options.json,
			copy: options.copy,
			out: options.out,
			empty,
			footer: hasMore ? searchFooter(limit) : undefined,
		},
		PAGE_NOUN,
		(id) => copyPage(env, id, options.out),
	);
}

export function formatPageRows(pages: PageSummary[], nowMs: number): SearchRow[] {
	return alignedRows(pages, nowMs, (p) => ({
		id: p.id,
		url: p.url,
		label: p.space,
		color: colorForSpace(p.space),
		text: p.title,
		timestamp: p.updated,
	}));
}

const SPACE_COLORS = [kleur.cyan, kleur.yellow, kleur.green, kleur.magenta, kleur.blue];

function colorForSpace(space: string): (text: string) => string {
	let hash = 0;
	for (const char of space) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
	return SPACE_COLORS[hash % SPACE_COLORS.length] ?? kleur.cyan;
}

const PAGE_NOUN = { singular: "page", plural: "pages" };

export async function copyPage(
	{ session, term }: Env,
	id: string,
	out: string | undefined,
): Promise<void> {
	term.err(`Fetching page ${id} ...`);
	const page = await fetchPage(session, session.site, id);
	await runCopy(term, planPageCopy(page, out), (url) => session.getBinary(url));
}

const PAGE_REF = {
	message: "Confluence page id or URL:",
	flag: "[page]",
	parse: parsePageId,
	notFound: (raw: string) => `Could not find a page id in "${raw}".`,
};
