import type { PageOptions, Terminal } from "#/terminal.ts";

import { tryPager } from "#/terminal/pager.ts";
import { inquirerPrompts, refusingPrompts } from "#/terminal/prompts.ts";

const DEFAULT_WIDTH = 80;

export function ttyTerminal(interactive = true): Terminal {
	return {
		interactive,
		out(value: string | string[]): void {
			if (Array.isArray(value) && value.length === 0) return;
			console.log(Array.isArray(value) ? value.join("\n") : value);
		},
		err(value: string): void {
			console.error(value);
		},
		json(value: unknown): void {
			console.log(JSON.stringify(value, null, 2));
		},
		async page(text: string, options: PageOptions = {}): Promise<void> {
			if (options.pager !== false && (await tryPager(text))) return;
			console.log(text);
		},
		get width(): number {
			return process.stdout.columns ?? DEFAULT_WIDTH;
		},
		ask: interactive ? inquirerPrompts : refusingPrompts,
	};
}
