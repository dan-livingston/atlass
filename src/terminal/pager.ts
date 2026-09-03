import { spawn } from "node:child_process";
import { stripVTControlCharacters } from "node:util";

interface Screen {
	isTTY?: boolean;
	rows?: number;
	columns?: number;
}

export interface PagerOptions {
	screen?: Screen;
	env?: NodeJS.ProcessEnv;
}

const DEFAULT_ROWS = 24;
const DEFAULT_COLUMNS = 80;
const DEFAULT_PAGER = "less";
const DEFAULT_LESS = "FRX";

export function renderedHeight(text: string, columns: number): number {
	const width = Math.max(1, columns);
	return text
		.split("\n")
		.map((line) => Math.max(1, Math.ceil(stripVTControlCharacters(line).length / width)))
		.reduce((sum, rows) => sum + rows, 0);
}

export function shouldPage(text: string, screen: Screen): boolean {
	if (!screen.isTTY) return false;
	const rows = screen.rows ?? DEFAULT_ROWS;
	const columns = screen.columns ?? DEFAULT_COLUMNS;
	return renderedHeight(text, columns) > rows;
}

export interface PagerCommand {
	command: string;
	args: string[];
	env: NodeJS.ProcessEnv;
}

export function pagerCommand(env: NodeJS.ProcessEnv): PagerCommand {
	const [command = DEFAULT_PAGER, ...args] = (env["PAGER"] ?? "")
		.trim()
		.split(/\s+/)
		.filter(Boolean);
	return { command, args, env: { ...env, LESS: env["LESS"] ?? DEFAULT_LESS } };
}

export async function tryPager(text: string, options: PagerOptions = {}): Promise<boolean> {
	if (!shouldPage(text, options.screen ?? process.stdout)) return false;
	return pipeToPager(text, pagerCommand(options.env ?? process.env));
}

function pipeToPager(text: string, pager: PagerCommand): Promise<boolean> {
	return new Promise((resolve) => {
		const child = spawn(pager.command, pager.args, {
			stdio: ["pipe", "inherit", "inherit"],
			env: pager.env,
		});
		child.once("error", () => resolve(false));
		child.once("close", () => resolve(true));
		child.stdin.once("error", () => {});
		child.stdin.end(`${text}\n`);
	});
}
