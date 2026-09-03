import kleur from "kleur";

import type {
	ConfirmSpec,
	EditSpec,
	PickManySpec,
	PickSpec,
	PromptKind,
	PromptSpec,
	SearchPickSpec,
	SecretSpec,
	Terminal,
	TextSpec,
} from "#/terminal.ts";

import { NotInteractiveError } from "#/terminal.ts";

export type Entry =
	| { stream: "out"; value: string }
	| { stream: "err"; value: string }
	| { stream: "page"; value: string }
	| { stream: "json"; value: unknown };

export interface AskRecord {
	kind: PromptKind;
	message: string;
}

export interface ScriptedOptions {
	answers?: unknown[];
	width?: number;
}

export interface ScriptedTerminal extends Terminal {
	readonly transcript: Entry[];
	readonly written: string[];
	readonly errors: string[];
	readonly paged: string[];
	readonly emitted: unknown[];
	readonly asked: AskRecord[];
}

const DEFAULT_WIDTH = 80;

export function scriptedTerminal(options: ScriptedOptions = {}): ScriptedTerminal {
	kleur.enabled = false;
	const transcript: Entry[] = [];
	const asked: AskRecord[] = [];
	const queue = options.answers ? [...options.answers] : undefined;

	async function next<T>(kind: PromptKind, spec: PromptSpec): Promise<T> {
		asked.push({ kind, message: spec.message });
		if (!queue) throw new NotInteractiveError(spec);
		if (queue.length === 0) throw new Error(`unexpected prompt "${spec.message}"`);
		return queue.shift() as T;
	}

	function text(stream: "out" | "err" | "page"): string[] {
		return transcript.filter((e) => e.stream === stream).map((e) => e.value as string);
	}

	return {
		interactive: queue !== undefined,
		out(value: string | string[]): void {
			if (Array.isArray(value) && value.length === 0) return;
			transcript.push({ stream: "out", value: join(value) });
		},
		err(value: string): void {
			transcript.push({ stream: "err", value });
		},
		json(value: unknown): void {
			transcript.push({ stream: "json", value });
		},
		async page(value: string): Promise<void> {
			transcript.push({ stream: "page", value });
		},
		width: options.width ?? DEFAULT_WIDTH,
		ask: {
			text: (spec: TextSpec) => next<string>("text", spec),
			secret: (spec: SecretSpec) => next<string>("secret", spec),
			confirm: (spec: ConfirmSpec) => next<boolean>("confirm", spec),
			pick: <T>(spec: PickSpec<T>) => next<T>("pick", spec),
			pickMany: <T>(spec: PickManySpec<T>) => next<T[]>("pickMany", spec),
			edit: (spec: EditSpec) => next<string>("edit", spec),
			searchPick: <T>(spec: SearchPickSpec<T>) => next<T>("searchPick", spec),
		},
		transcript,
		asked,
		get written() {
			return text("out");
		},
		get errors() {
			return text("err");
		},
		get paged() {
			return text("page");
		},
		get emitted() {
			return transcript.filter((e) => e.stream === "json").map((e) => e.value);
		},
	};
}

function join(value: string | string[]): string {
	return Array.isArray(value) ? value.join("\n") : value;
}
