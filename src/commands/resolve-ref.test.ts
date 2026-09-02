import { expect, test } from "vite-plus/test";

import { resolveRef } from "./resolve-ref.ts";

const ISSUE_REF = {
	message: "Jira issue key or URL:",
	parse: (raw: string) => (raw.startsWith("PROJ-") ? raw : null),
	notFound: (raw: string) => `Could not find an issue key in "${raw}" (expected e.g. PROJ-123).`,
};

test("a given argument is parsed without prompting", async () => {
	expect(await resolveRef("PROJ-7", ISSUE_REF)).toBe("PROJ-7");
});

test("an argument the parser rejects fails with the caller's phrasing", async () => {
	await expect(resolveRef("nope", ISSUE_REF)).rejects.toThrow(
		'Could not find an issue key in "nope" (expected e.g. PROJ-123).',
	);
});
