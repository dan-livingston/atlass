export interface PromptSpec {
	message: string;
	flag?: string;
}

export interface Choice<T> {
	name: string;
	value: T;
	description?: string;
	checked?: boolean;
}

export type Validate = (value: string) => string | true | Promise<string | true>;

export interface TextSpec extends PromptSpec {
	required?: boolean;
	default?: string;
	validate?: Validate;
}

export interface SecretSpec extends PromptSpec {
	mask?: boolean;
}

export interface ConfirmSpec extends PromptSpec {
	default?: boolean;
}

export interface PickSpec<T> extends PromptSpec {
	choices: Choice<T>[];
	default?: T;
	pageSize?: number;
}

export interface PickManySpec<T> extends PromptSpec {
	choices: Choice<T>[];
	required?: boolean;
	pageSize?: number;
}

export interface EditSpec extends PromptSpec {
	postfix?: string;
	default?: string;
	validate?: Validate;
}

export interface SearchPickSpec<T> extends PromptSpec {
	source: (term: string | undefined) => Promise<Choice<T>[]>;
	pageSize?: number;
}

export interface Prompts {
	text(spec: TextSpec): Promise<string>;
	secret(spec: SecretSpec): Promise<string>;
	confirm(spec: ConfirmSpec): Promise<boolean>;
	pick<T>(spec: PickSpec<T>): Promise<T>;
	pickMany<T>(spec: PickManySpec<T>): Promise<T[]>;
	edit(spec: EditSpec): Promise<string>;
	searchPick<T>(spec: SearchPickSpec<T>): Promise<T>;
}

export type PromptKind = keyof Prompts;

export interface PageOptions {
	pager?: boolean;
}

export interface Terminal {
	readonly interactive: boolean;
	out(text: string | string[]): void;
	err(text: string): void;
	json(value: unknown): void;
	page(text: string, options?: PageOptions): Promise<void>;
	readonly width: number;
	readonly ask: Prompts;
}

export class NotInteractiveError extends Error {
	constructor(spec: PromptSpec) {
		super(
			spec.flag
				? `Cannot prompt without a terminal. Pass ${spec.flag}.`
				: `Cannot prompt without a terminal: ${spec.message}`,
		);
		this.name = "NotInteractiveError";
	}
}
