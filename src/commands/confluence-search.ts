import kleur from "kleur";

import type { PageSearchParams, PageSummary } from "#/api/confluence-search.ts";
import type { OutputOptions, SearchRow } from "#/commands/search-run.ts";
import type { SessionEnv } from "#/env.ts";

import { searchPages, searchPagesByCql } from "#/api/confluence-search.ts";
import { copyPage } from "#/commands/confluence.ts";
import { alignedRows, checkedLimit, showRows } from "#/commands/search-run.ts";
import { parseSince } from "#/util/parse.ts";

export interface SearchOptions extends OutputOptions {
	space?: string[];
	label?: string[];
	updated?: string;
	starred?: boolean;
}

export interface ListOptions extends OutputOptions {
	space?: string;
}

export async function confluenceSearch(
	env: SessionEnv,
	query: string | undefined,
	options: SearchOptions,
): Promise<void> {
	await listPages(
		env,
		{
			text: query,
			space: options.space,
			label: options.label,
			starred: options.starred,
			updatedSince: options.updated ? parseSince(options.updated, Date.now()) : undefined,
		},
		"No matching pages.",
		options,
	);
}

export async function confluenceList(env: SessionEnv, options: ListOptions): Promise<void> {
	await listPages(
		env,
		{ starred: true, space: options.space ? [options.space] : undefined },
		options.space ? `No starred pages in ${options.space}.` : "No starred pages.",
		options,
	);
}

export async function confluenceCql(
	env: SessionEnv,
	query: string,
	options: OutputOptions,
): Promise<void> {
	const limit = checkedLimit(options);
	const { pages, hasMore } = await searchPagesByCql(env.session, env.session.site, query, limit);
	await showPages(env, pages, hasMore, limit, options);
}

async function listPages(
	env: SessionEnv,
	filter: Omit<PageSearchParams, "limit">,
	empty: string,
	options: OutputOptions,
): Promise<void> {
	const limit = checkedLimit(options);
	const { pages, hasMore } = await searchPages(env.session, env.session.site, {
		...filter,
		limit,
	});
	await showPages(env, pages, hasMore, limit, options, empty);
}

async function showPages(
	env: SessionEnv,
	pages: PageSummary[],
	hasMore: boolean,
	limit: number,
	options: OutputOptions,
	empty = "No matching pages.",
): Promise<void> {
	await showRows(
		env.term,
		formatPageRows(pages, Date.now()),
		{ empty, hasMore, limit },
		options,
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
