import { expect, test } from "vite-plus/test";

import { resolveRef } from "#/commands/resolve-ref.ts";
import { scriptedTerminal } from "#/terminal/scripted.ts";

const ask = scriptedTerminal().ask;

const ISSUE_REF = {
	message: "Jira issue key or URL:",
	parse: (raw: string) => (raw.startsWith("PROJ-") ? raw : null),
	notFound: (raw: string) => `Could not find an issue key in "${raw}" (expected e.g. PROJ-123).`,
};

test("a given argument is parsed without prompting", async () => {
	expect(await resolveRef(ask, "PROJ-7", ISSUE_REF)).toBe("PROJ-7");
});

test("an argument the parser rejects fails with the caller's phrasing", async () => {
	await expect(resolveRef(ask, "nope", ISSUE_REF)).rejects.toThrow(
		'Could not find an issue key in "nope" (expected e.g. PROJ-123).',
	);
});
