import kleur from "kleur";
import { expect, test } from "vite-plus/test";

import { hyperlink } from "#/util/link.ts";

const HREF = "https://x.atlassian.net/browse/PROJ-1";

test("wraps text in an OSC 8 hyperlink when color is enabled", () => {
	kleur.enabled = true;
	expect(hyperlink("PROJ-1", HREF)).toBe(`\u001b]8;;${HREF}\u0007PROJ-1\u001b]8;;\u0007`);
});

test("returns plain text when color is disabled", () => {
	kleur.enabled = false;
	expect(hyperlink("PROJ-1", HREF)).toBe("PROJ-1");
});

test("returns plain text when there is no url", () => {
	kleur.enabled = true;
	const plain = hyperlink("12345", "");
	kleur.enabled = false;
	expect(plain).toBe("12345");
});
