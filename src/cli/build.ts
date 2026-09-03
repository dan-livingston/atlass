import { Command } from "commander";

import { registerAuth } from "#/cli/auth.ts";
import { registerBitbucket } from "#/cli/bitbucket.ts";
import { registerConfluence } from "#/cli/confluence.ts";
import { registerJira } from "#/cli/jira.ts";
import pkg from "#package.json" with { type: "json" };

const PRODUCTS = {
	jira: registerJira,
	confluence: registerConfluence,
	bitbucket: registerBitbucket,
} as const;

type Product = keyof typeof PRODUCTS;

const NO_INPUT = "never prompt; fail if a required value is missing";

function withNoInput(command: Command): Command {
	command.option("--no-input", NO_INPUT);
	for (const sub of command.commands) withNoInput(sub);
	return command;
}

export function buildAtlass(): Command {
	const program = new Command()
		.name("atlass")
		.description("Copy Jira issues and Confluence pages to Markdown.")
		.version(pkg.version);
	registerAuth(program.command("auth"));
	registerJira(program.command("jira"));
	registerConfluence(program.command("confluence").alias("conf"));
	registerBitbucket(program.command("bitbucket").alias("bb"));
	return withNoInput(program);
}

export function buildStandalone(product: Product): Command {
	return withNoInput(PRODUCTS[product](new Command().name(product).version(pkg.version)));
}
