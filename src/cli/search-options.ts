import type { Command } from "commander";

import { Option } from "commander";

export function collect(value: string, previous: string[] = []): string[] {
	return [...previous, value];
}

export function moved(flags: string, command: string): Option {
	const flag = flags.split(" ")[0]!;
	return new Option(flags).hideHelp().argParser((): never => {
		throw new Error(`${flag} is now its own command: \`atlass ${command} "<query>"\`.`);
	});
}

export function outputOptions(command: Command): Command {
	return command
		.option("-l, --limit <n>", "max results (default 25, max 100)")
		.option("--json", "output results as JSON")
		.option("-c, --copy", "pick results to copy to Markdown")
		.option("-o, --out <dir>", "output directory for --copy");
}
