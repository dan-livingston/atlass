import { checkbox } from "@inquirer/prompts";
import { stripVTControlCharacters } from "node:util";

import { relativeTime } from "#/util/format.ts";
import { hyperlink } from "#/util/link.ts";

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

export interface PrintRowsOptions {
	json?: boolean;
	empty: string;
	footer?: string;
}

export function printRows(rows: SearchRow[], options: PrintRowsOptions): void {
	if (options.json) {
		console.log(
			JSON.stringify(
				rows.map((r) => r.json),
				null,
				2,
			),
		);
		return;
	}
	if (rows.length === 0) {
		console.log(options.empty);
		return;
	}
	for (const row of rows) console.log(formatRow(row));
	if (options.footer) console.log(options.footer);
}

export interface RunSearchOptions extends PrintRowsOptions {
	copy?: boolean;
	out?: string;
}

const COPY_CONCURRENCY = 5;

export interface Noun {
	singular: string;
	plural: string;
}

export async function runSearch(
	rows: SearchRow[],
	options: RunSearchOptions,
	noun: Noun,
	copyOne: (id: string) => Promise<void>,
): Promise<void> {
	const selecting = options.copy && !options.json && rows.length > 0;
	if (!selecting) {
		printRows(rows, options);
		return;
	}
	if (options.out?.endsWith(".md")) {
		throw new Error(
			"--out must be a directory when using --copy; a .md file path would overwrite each selection.",
		);
	}
	await copySelected(rows, noun, copyOne);
}

export function searchFooter(limit: number): string {
	return `
Showing first ${limit}; refine with flags or raise --limit.`;
}

async function copySelected(rows: SearchRow[], noun: Noun, copyOne: (id: string) => Promise<void>) {
	if (!process.stdin.isTTY) {
		throw new Error("--copy requires an interactive terminal.");
	}
	const selected = await checkbox({
		message: `Select ${noun.plural} to copy:`,
		choices: rows.map((r) => ({ name: formatRow(r), value: r.id })),
		pageSize: 20,
	});
	if (selected.length === 0) {
		console.log("Nothing selected.");
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
	if (failures.length === 0) console.log(summary);
	else console.log(`${summary}, failed ${failures.length}: ${failures.join(", ")}`);
}

export function formatRow(row: SearchRow, width = process.stdout.columns ?? 80): string {
	const room = width - stripVTControlCharacters(row.fixedColumns).length - 2;
	const text = room > 0 ? truncate(row.freeText, room) : "";
	const columns = hyperlink(row.id, row.url) + row.fixedColumns.slice(row.id.length);
	return text ? `${columns}  ${hyperlink(text, row.url)}` : columns;
}

function truncate(text: string, max: number): string {
	const clean = text.replace(/\s+/g, " ").trim();
	return clean.length <= max ? clean : `${clean.slice(0, Math.max(0, max - 3))}...`;
}
