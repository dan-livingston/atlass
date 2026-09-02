import { input } from "@inquirer/prompts";
import { readFile, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";

import type { CopyOptions } from "#/commands/jira.ts";
import type { LocalImage } from "#/update/plan.ts";

import { imageHrefs } from "#/adf/from-markdown.ts";
import { AtlassianClient } from "#/api/client.ts";
import {
	fetchPage,
	fetchPageState,
	listAttachments,
	searchPages,
	updatePage,
	uploadAttachment,
} from "#/api/confluence.ts";
import { resolveRef } from "#/commands/resolve-ref.ts";
import { runSearch, searchFooter } from "#/commands/search-run.ts";
import { planPageCopy } from "#/copy/plan.ts";
import { runCopy } from "#/copy/run.ts";
import { requireAuth } from "#/credentials.ts";
import { parsePageSource } from "#/markdown/copied-document.ts";
import { planPageUpdate, withUploadedIds } from "#/update/plan.ts";
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

export async function confluenceCopy(arg: string | undefined, options: CopyOptions): Promise<void> {
	const auth = await requireAuth();
	const id = await resolveRef(arg, PAGE_REF);
	const client = new AtlassianClient(auth);
	await copyPage(client, auth.site, id, options.out);
}

export interface UpdateOptions {
	title?: boolean;
	message?: string;
	force?: boolean;
	dryRun?: boolean;
}

export async function confluenceUpdate(
	arg: string | undefined,
	options: UpdateOptions,
): Promise<void> {
	const file =
		arg ?? (await input({ message: "Path to the page Markdown file:", required: true }));
	const src = parsePageSource(await readFile(file, "utf8"));

	const auth = await requireAuth();
	const client = new AtlassianClient(auth);
	const state = await fetchPageState(client, src.id);
	const attachments = await listAttachments(client, src.id);
	const localImages = await statLocalImages(dirname(resolve(file)), src.body);

	const plan = planPageUpdate(src, state, attachments, localImages, options);
	await runPlan(plan, options, async () => {
		const ids = new Map<string, string>();
		for (const upload of plan.uploads) {
			console.log(`Uploading ${upload.filename} ...`);
			const bytes = await readFile(upload.path);
			ids.set(upload.href, await uploadAttachment(client, src.id, upload.filename, bytes));
		}
		const version = await updatePage(client, src.id, {
			title: plan.headline.next,
			nextVersion: state.version + 1,
			body: withUploadedIds(plan.body, ids),
			message: options.message ?? "Updated via atlass",
		});
		console.log(`Updated page ${src.id} to version ${version}.`);
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
	query: string | undefined,
	options: SearchOptions,
): Promise<void> {
	if (options.cql && (query || options.space)) {
		throw new Error("--cql cannot be combined with a text query or --space.");
	}
	if (options.json && options.copy) {
		throw new Error("--json and --copy cannot be used together.");
	}

	const auth = await requireAuth();
	const client = new AtlassianClient(auth);
	const limit = parseLimit(options.limit);
	const { pages, hasMore } = await searchPages(client, auth.site, {
		text: query,
		space: options.space,
		cql: options.cql,
		limit,
	});

	await runSearch(
		pages.map((p) => ({
			id: p.id,
			fixedColumns: `${p.id}  ${p.space}`,
			freeText: p.title,
			json: { id: p.id, space: p.space, title: p.title, url: p.url },
		})),
		{
			json: options.json,
			copy: options.copy,
			out: options.out,
			empty: "No matching pages.",
			footer: hasMore ? searchFooter(limit) : undefined,
		},
		{ singular: "page", plural: "pages" },
		(id) => copyPage(client, auth.site, id, options.out),
	);
}

export async function copyPage(
	client: AtlassianClient,
	site: string,
	id: string,
	out: string | undefined,
): Promise<void> {
	console.log(`Fetching page ${id} ...`);
	const page = await fetchPage(client, site, id);
	await runCopy(planPageCopy(page, out), (url) => client.getBinary(url));
}

const PAGE_REF = {
	message: "Confluence page id or URL:",
	parse: parsePageId,
	notFound: (raw: string) => `Could not find a page id in "${raw}".`,
};
