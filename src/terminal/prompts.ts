import { checkbox, confirm, editor, input, password, search, select } from "@inquirer/prompts";

import type {
	ConfirmSpec,
	EditSpec,
	PickManySpec,
	PickSpec,
	Prompts,
	SearchPickSpec,
	SecretSpec,
	PromptSpec,
	TextSpec,
} from "#/terminal.ts";

import { NotInteractiveError } from "#/terminal.ts";

export const inquirerPrompts: Prompts = {
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

async function refuse(spec: PromptSpec): Promise<never> {
	throw new NotInteractiveError(spec);
}

export const refusingPrompts: Prompts = {
	text: refuse,
	secret: refuse,
	confirm: refuse,
	pick: refuse,
	pickMany: refuse,
	edit: refuse,
	searchPick: refuse,
};
