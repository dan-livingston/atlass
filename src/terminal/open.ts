import type { Command } from "commander";

import type { Terminal } from "#/terminal.ts";

import { ttyTerminal } from "#/terminal/tty.ts";

export function openTerminal(args: unknown[], stdin: { isTTY?: boolean }): Terminal {
	return ttyTerminal(stdin.isTTY === true && !refusedInput(args.at(-1)));
}

function refusedInput(last: unknown): boolean {
	for (let command = asCommand(last); command; command = command.parent) {
		if (command.opts()["input"] === false) return true;
	}
	return false;
}

function asCommand(value: unknown): Command | null {
	const command = value as Command | null;
	return typeof command?.opts === "function" ? command : null;
}
