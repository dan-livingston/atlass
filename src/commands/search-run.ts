import { checkbox } from "@inquirer/prompts";

export interface SearchRow {
	id: string;
	fixedColumns: string;
	freeText: string;
	json: Record<string, unknown>;
}

export interface RunSearchOptions {
	json?: boolean;
	copy?: boolean;
	limit: number;
	hasMore?: boolean;
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
		console.log(`No matching ${noun.plural}.`);
		return;
	}

	if (options.copy) {
		if (options.out?.endsWith(".md")) {
			throw new Error(
				"--out must be a directory when using --copy; a .md file path would overwrite each selection.",
			);
		}
		await copySelected(rows, noun, copyOne);
		return;
	}

	for (const row of rows) console.log(formatRow(row));
	if (options.hasMore) {
		console.log(`\nShowing first ${options.limit}; refine with flags or raise --limit.`);
	}
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

function formatRow(row: SearchRow): string {
	const width = process.stdout.columns ?? 80;
	const room = width - row.fixedColumns.length - 2;
	const text = room > 0 ? truncate(row.freeText, room) : "";
	return text ? `${row.fixedColumns}  ${text}` : row.fixedColumns;
}

function truncate(text: string, max: number): string {
	const clean = text.replace(/\s+/g, " ").trim();
	return clean.length <= max ? clean : `${clean.slice(0, Math.max(0, max - 3))}...`;
}
