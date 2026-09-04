import { stripVTControlCharacters } from "node:util";

import type { Terminal } from "#/terminal.ts";

import { relativeTime } from "#/util/format.ts";
import { hyperlink } from "#/util/link.ts";
import { parseLimit } from "#/util/parse.ts";

export interface OutputOptions {
	limit?: string;
	json?: boolean;
	copy?: boolean;
	out?: string;
}

export function checkedLimit(options: OutputOptions): number {
	if (options.json && options.copy) {
		throw new Error("--json and --copy cannot be used together.");
	}
	return parseLimit(options.limit);
}

export interface Listing {
	empty: string;
	hasMore: boolean;
	limit: number;
}

export async function showRows(
	term: Terminal,
	rows: SearchRow[],
	listing: Listing,
	options: OutputOptions,
	noun: Noun,
	copyOne: (id: string) => Promise<void>,
): Promise<void> {
	await runSearch(
		term,
		rows,
		{
			json: options.json,
			copy: options.copy,
			out: options.out,
			empty: listing.empty,
			footer: listing.hasMore ? searchFooter(listing.limit) : undefined,
		},
		noun,
		copyOne,
	);
}

export interface SearchRow {
	id: string;
	url: string;
	fixedColumns: string;
	freeText: string;
	json: unknown;
}

export interface Cells {
	id: string;
	url: string;
	label: string;
	color: (text: string) => string;
	text: string;
	timestamp: string;
}

export function alignedRows<T extends object>(
	items: T[],
	nowMs: number,
	cells: (item: T) => Cells,
): SearchRow[] {
	const rows = items.map((item) => {
		const cell = cells(item);
		return { ...cell, age: relativeTime(cell.timestamp, nowMs), json: { ...item } };
	});
	const width = (pick: (row: (typeof rows)[number]) => string) =>
		Math.max(...rows.map((row) => pick(row).length));
	const idWidth = width((row) => row.id);
	const labelWidth = width((row) => row.label);
	const ageWidth = width((row) => row.age);
	return rows.map((row) => ({
		id: row.id,
		url: row.url,
		fixedColumns: `${row.id.padEnd(idWidth)}  ${row.color(row.label.padEnd(labelWidth))}  ${row.age.padEnd(ageWidth)}`,
		freeText: row.text,
		json: row.json,
	}));
}

export interface FormatRowsOptions {
	empty: string;
	footer?: string;
	width: number;
}

export function formatRows(rows: SearchRow[], options: FormatRowsOptions): string[] {
	if (rows.length === 0) return [options.empty];
	const lines = rows.map((row) => formatRow(row, options.width));
	return options.footer ? [...lines, options.footer] : lines;
}

export interface WriteRowsOptions {
	json?: boolean;
	empty: string;
	footer?: string;
}

export function writeRows(term: Terminal, rows: SearchRow[], options: WriteRowsOptions): void {
	if (options.json) term.json(rows.map((r) => r.json));
	else term.out(formatRows(rows, { ...options, width: term.width }));
}

export interface RunSearchOptions extends WriteRowsOptions {
	copy?: boolean;
	out?: string;
}

const COPY_CONCURRENCY = 5;

export interface Noun {
	singular: string;
	plural: string;
}

export async function runSearch(
	term: Terminal,
	rows: SearchRow[],
	options: RunSearchOptions,
	noun: Noun,
	copyOne: (id: string) => Promise<void>,
): Promise<void> {
	const selecting = options.copy && !options.json && rows.length > 0;
	if (!selecting) {
		writeRows(term, rows, options);
		return;
	}
	if (options.out?.endsWith(".md")) {
		throw new Error(
			"--out must be a directory when using --copy; a .md file path would overwrite each selection.",
		);
	}
	await copySelected(term, rows, noun, copyOne);
}

export function searchFooter(limit: number): string {
	return `
Showing first ${limit}; refine with flags or raise --limit.`;
}

async function copySelected(
	term: Terminal,
	rows: SearchRow[],
	noun: Noun,
	copyOne: (id: string) => Promise<void>,
) {
	if (!term.interactive) throw new Error("--copy requires an interactive terminal.");
	const selected = await term.ask.pickMany<string>({
		message: `Select ${noun.plural} to copy:`,
		choices: rows.map((r) => ({ name: formatRow(r, term.width), value: r.id })),
		pageSize: 20,
	});
	if (selected.length === 0) {
		term.out("Nothing selected.");
		return;
	}

	let copied = 0;
	const failures: string[] = [];
	const queue = [...selected];
	async function worker() {
		for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
			try {
				await copyOne(id);
				copied++;
			} catch (err) {
				failures.push(`${id} (${err instanceof Error ? err.message : String(err)})`);
			}
		}
	}
	await Promise.all(Array.from({ length: Math.min(COPY_CONCURRENCY, selected.length) }, worker));

	const summary = `Copied ${copied} ${copied === 1 ? noun.singular : noun.plural}`;
	if (failures.length === 0) term.out(summary);
	else term.out(`${summary}, failed ${failures.length}: ${failures.join(", ")}`);
}

export function formatRow(row: SearchRow, width: number): string {
	const room = width - stripVTControlCharacters(row.fixedColumns).length - 2;
	const text = room > 0 ? truncate(row.freeText, room) : "";
	const columns = hyperlink(row.id, row.url) + row.fixedColumns.slice(row.id.length);
	return text ? `${columns}  ${hyperlink(text, row.url)}` : columns;
}

function truncate(text: string, max: number): string {
	const clean = text.replace(/\s+/g, " ").trim();
	return clean.length <= max ? clean : `${clean.slice(0, Math.max(0, max - 3))}...`;
}
