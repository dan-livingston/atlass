import type { Terminal } from "#/terminal.ts";

import { ttyTerminal } from "#/terminal/tty.ts";

const NO_INPUT = "--no-input";

export function openTerminal(argv: string[], stdin: { isTTY?: boolean }): Terminal {
	return ttyTerminal(stdin.isTTY === true && !argv.includes(NO_INPUT));
}
