import { expect, test } from "vite-plus/test";

import { NotInteractiveError } from "#/terminal.ts";
import { scriptedTerminal } from "#/terminal/scripted.ts";

test("out and err land in one transcript, tagged by stream and kept in order", async () => {
	const term = scriptedTerminal();
	term.out("first");
	term.err("second");
	term.out("third");
	expect(term.transcript).toEqual([
		{ stream: "out", value: "first" },
		{ stream: "err", value: "second" },
		{ stream: "out", value: "third" },
	]);
	expect(term.written).toEqual(["first", "third"]);
	expect(term.errors).toEqual(["second"]);
});

test("out takes a line or a block of lines, and an empty block writes nothing", () => {
	const term = scriptedTerminal();
	term.out(["a", "b"]);
	term.out([]);
	term.out("c");
	expect(term.written).toEqual(["a\nb", "c"]);
});

test("json keeps the value, so a test never parses its own output", () => {
	const term = scriptedTerminal();
	term.json({ key: "PROJ-1" });
	expect(term.emitted).toEqual([{ key: "PROJ-1" }]);
	expect(term.written).toEqual([]);
});

test("page records separately from out", async () => {
	const term = scriptedTerminal();
	await term.page("a long document");
	expect(term.paged).toEqual(["a long document"]);
	expect(term.written).toEqual([]);
});

test("width defaults to 80 and can be set", () => {
	expect(scriptedTerminal().width).toBe(80);
	expect(scriptedTerminal({ width: 120 }).width).toBe(120);
});

test("with no answer source at all, a prompt refuses and names the flag", async () => {
	const term = scriptedTerminal();
	await expect(
		term.ask.text({ message: "Path to the issue Markdown file:", flag: "<file>" }),
	).rejects.toThrow(new NotInteractiveError({ message: "", flag: "<file>" }));
	await expect(term.ask.confirm({ message: "Overwrite?" })).rejects.toThrow(
		"Cannot prompt without a terminal: Overwrite?",
	);
});

test("an answer source answers in order, whatever the prompt kind", async () => {
	const term = scriptedTerminal({ answers: ["ada@example.test", true, ["a", "b"], "one"] });
	expect(await term.ask.text({ message: "Email:" })).toBe("ada@example.test");
	expect(await term.ask.confirm({ message: "Sure?" })).toBe(true);
	expect(
		await term.ask.pickMany({ message: "Fields:", choices: [{ name: "A", value: "a" }] }),
	).toEqual(["a", "b"]);
	expect(
		await term.ask.pick({ message: "Type:", choices: [{ name: "One", value: "one" }] }),
	).toBe("one");
});

test("an exhausted answer source is an unexpected prompt, not a refusal", async () => {
	const term = scriptedTerminal({ answers: [] });
	await expect(term.ask.text({ message: "Email:", flag: "--email" })).rejects.toThrow(
		'unexpected prompt "Email:"',
	);
});

test("asked records the kind and message of every prompt", async () => {
	const term = scriptedTerminal({ answers: ["x", false] });
	await term.ask.secret({ message: "API token:" });
	await term.ask.confirm({ message: "Create PROJ Bug?" });
	expect(term.asked).toEqual([
		{ kind: "secret", message: "API token:" },
		{ kind: "confirm", message: "Create PROJ Bug?" },
	]);
});
