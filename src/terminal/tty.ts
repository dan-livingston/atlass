import { checkbox, confirm, editor, input, password, search, select } from "@inquirer/prompts";

import type {
	ConfirmSpec,
	EditSpec,
	PageOptions,
	PickManySpec,
	PickSpec,
	Prompts,
	SearchPickSpec,
	SecretSpec,
	Terminal,
	TextSpec,
} from "#/terminal.ts";

import { tryPager } from "#/terminal/pager.ts";

const DEFAULT_WIDTH = 80;

const ask: Prompts = {
	text: (spec: TextSpec) =>
		input({
			message: spec.message,
			required: spec.required,
			default: spec.default,
			validate: spec.validate,
		}),
	secret: (spec: SecretSpec) => password({ message: spec.message, mask: spec.mask }),
	confirm: (spec: ConfirmSpec) => confirm({ message: spec.message, default: spec.default }),
	pick: <T>(spec: PickSpec<T>) =>
		select<T>({
			message: spec.message,
			choices: spec.choices,
			default: spec.default,
			pageSize: spec.pageSize,
		}),
	pickMany: <T>(spec: PickManySpec<T>) =>
		checkbox<T>({
			message: spec.message,
			choices: spec.choices,
			required: spec.required,
			pageSize: spec.pageSize,
		}),
	edit: (spec: EditSpec) =>
		editor({
			message: spec.message,
			postfix: spec.postfix,
			default: spec.default,
			validate: spec.validate,
		}),
	searchPick: <T>(spec: SearchPickSpec<T>) =>
		search<T>({
			message: spec.message,
			source: (term) => spec.source(term),
			pageSize: spec.pageSize,
		}),
};

export function ttyTerminal(): Terminal {
	return {
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
		ask,
	};
}
