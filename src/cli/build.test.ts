import type { Command } from "commander";

import { expect, test } from "vite-plus/test";

import { buildAtlass, buildStandalone } from "#/cli/build.ts";

const PRODUCTS = ["jira", "confluence", "bitbucket"] as const;

type Tree = {
	name: string;
	aliases: string[];
	description: string;
	args: { name: string; required: boolean; variadic: boolean }[];
	options: { flags: string; description: string }[];
	commands: Tree[];
};

function tree(cmd: Command): Tree {
	return {
		name: cmd.name(),
		aliases: cmd.aliases(),
		description: cmd.description(),
		args: cmd.registeredArguments.map((a) => ({
			name: a.name(),
			required: a.required,
			variadic: a.variadic,
		})),
		options: cmd.options.map((o) => ({ flags: o.flags, description: o.description })),
		commands: cmd.commands.map(tree),
	};
}

function atlassSubcommand(name: string): Command {
	const cmd = buildAtlass().commands.find((c) => c.name() === name);
	if (!cmd) throw new Error(`atlass has no ${name} command`);
	return cmd;
}

for (const product of PRODUCTS) {
	test(`${product} standalone mirrors atlass ${product}`, () => {
		const standalone = tree(buildStandalone(product));
		const expected = tree(atlassSubcommand(product));
		expect(standalone.name).toBe(product);
		expect(standalone.description).toBe(expected.description);
		expect(standalone.commands).toEqual(expected.commands);
		expect(standalone.options.map((o) => o.flags)).toEqual(["-V, --version"]);
	});
}

test("atlass carries short aliases for the long product names", () => {
	expect(atlassSubcommand("bitbucket").aliases()).toEqual(["bb"]);
	expect(atlassSubcommand("confluence").aliases()).toEqual(["conf"]);
	expect(atlassSubcommand("jira").aliases()).toEqual([]);
});

test("standalone programs expose no auth group", () => {
	for (const product of ["jira", "confluence"] as const) {
		const names = buildStandalone(product).commands.map((c) => c.name());
		expect(names).not.toContain("auth");
	}
});

test("all programs report the package version", () => {
	const atlass = buildAtlass();
	for (const product of PRODUCTS) {
		expect(buildStandalone(product).version()).toBe(atlass.version());
	}
});
