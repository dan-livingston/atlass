import { expect, test } from "vite-plus/test";

import { buildStandalone } from "#/cli/build.ts";

function run(product: "jira" | "confluence", argv: string[]) {
	return buildStandalone(product).parseAsync(argv, { from: "user" });
}

test("--jql names the command that replaced it", async () => {
	await expect(run("jira", ["search", "--jql", "project = PROJ"])).rejects.toThrow(
		'--jql is now its own command: `atlass jira jql "<query>"`.',
	);
});

test("--cql names the command that replaced it", async () => {
	await expect(run("confluence", ["search", "--cql", "type = page"])).rejects.toThrow(
		'--cql is now its own command: `atlass confluence cql "<query>"`.',
	);
});

test("the moved options stay out of the help text", () => {
	const help = buildStandalone("jira")
		.commands.find((c) => c.name() === "search")!
		.helpInformation();
	expect(help).not.toContain("--jql");
	expect(help).toContain("--updated");
});
