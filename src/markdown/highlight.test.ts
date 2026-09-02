import kleur from "kleur";
import { expect, test } from "vite-plus/test";

import { highlightMarkdown } from "#/markdown/highlight.ts";

kleur.enabled = true;

test("heading: whole line is bold cyan", () => {
	expect(highlightMarkdown("## Steps")).toBe(kleur.bold().cyan("## Steps"));
});

test("plain paragraph is untouched", () => {
	expect(highlightMarkdown("Just words.")).toBe("Just words.");
});

test("inline: code spans are yellow including backticks", () => {
	expect(highlightMarkdown("run `npm test` now")).toBe(`run ${kleur.yellow("`npm test`")} now`);
});

test("inline: bold keeps its markers and is bold", () => {
	expect(highlightMarkdown("a **b** c")).toBe(`a ${kleur.bold("**b**")} c`);
});

test("inline: markers inside a code span are not styled", () => {
	expect(highlightMarkdown("`**x**`")).toBe(kleur.yellow("`**x**`"));
});

test("inline: bold inside a heading stays part of the heading", () => {
	expect(highlightMarkdown("# A **b**")).toBe(kleur.bold().cyan("# A **b**"));
});

test("inline: italic and strike keep their markers", () => {
	expect(highlightMarkdown("*a* ~~b~~")).toBe(
		`${kleur.italic("*a*")} ${kleur.strikethrough("~~b~~")}`,
	);
});

test("inline: italic nests inside bold", () => {
	expect(highlightMarkdown("**a *b* c**")).toBe(kleur.bold(`**a ${kleur.italic("*b*")} c**`));
});

test("inline: triple asterisks are bold italic", () => {
	expect(highlightMarkdown("***x***")).toBe(kleur.bold().italic("***x***"));
});

test("inline: links dim the syntax and underline the url", () => {
	expect(highlightMarkdown("see [docs](https://x.y)")).toBe(
		`see ${kleur.dim("[")}docs${kleur.dim("](")}${kleur.dim().underline("https://x.y")}${kleur.dim(")")}`,
	);
});

test("inline: link text carries its own styles", () => {
	expect(highlightMarkdown("[**b**](u)")).toBe(
		`${kleur.dim("[")}${kleur.bold("**b**")}${kleur.dim("](")}${kleur.dim().underline("u")}${kleur.dim(")")}`,
	);
});

test("block: quote prefix is dim and the rest is highlighted", () => {
	expect(highlightMarkdown("> **Info**")).toBe(`${kleur.dim(">")} ${kleur.bold("**Info**")}`);
});

test("block: nested quote prefixes each dim", () => {
	expect(highlightMarkdown("> > x")).toBe(`${kleur.dim(">")} ${kleur.dim(">")} x`);
});

test("block: list markers are dim and indentation is kept", () => {
	expect(highlightMarkdown("- a\n  1. **b**")).toBe(
		`${kleur.dim("-")} a\n  ${kleur.dim("1.")} ${kleur.bold("**b**")}`,
	);
});

test("block: task checkboxes are bold after a dim marker", () => {
	expect(highlightMarkdown("- [x] done\n- [ ] todo")).toBe(
		`${kleur.dim("-")} ${kleur.bold("[x]")} done\n${kleur.dim("-")} ${kleur.bold("[ ]")} todo`,
	);
});

test("block: a quoted list dims both prefixes", () => {
	expect(highlightMarkdown("> - a")).toBe(`${kleur.dim(">")} ${kleur.dim("-")} a`);
});

test("block: rule is dim", () => {
	expect(highlightMarkdown("---")).toBe(kleur.dim("---"));
});

test("block: table header is bold, separator dim, pipes dim", () => {
	expect(highlightMarkdown("| a | b |\n| --- | --- |\n| `c` | d |")).toBe(
		[
			`${kleur.dim("|")}${kleur.bold(" a ")}${kleur.dim("|")}${kleur.bold(" b ")}${kleur.dim("|")}`,
			kleur.dim("| --- | --- |"),
			`${kleur.dim("|")} ${kleur.yellow("`c`")} ${kleur.dim("|")} d ${kleur.dim("|")}`,
		].join("\n"),
	);
});

test("block: details tags are dim", () => {
	expect(highlightMarkdown("<details><summary>More</summary>\n\nx\n\n</details>")).toBe(
		`${kleur.dim("<details><summary>")}More${kleur.dim("</summary>")}\n\nx\n\n${kleur.dim("</details>")}`,
	);
});

test("fence: untagged code is flat yellow between dim fences", () => {
	expect(highlightMarkdown("```\nplain **x**\n```")).toBe(
		[kleur.dim("```"), kleur.yellow("plain **x**"), kleur.dim("```")].join("\n"),
	);
});

test("fence: tagged code is highlighted by language", () => {
	expect(highlightMarkdown('```js\nconst x = 1; // hi\nfoo("s");\n```')).toBe(
		[
			kleur.dim("```js"),
			`${kleur.magenta("const")} x = ${kleur.yellow("1")}; ${kleur.dim("// hi")}`,
			`${kleur.cyan("foo")}(${kleur.green('"s"')});`,
			kleur.dim("```"),
		].join("\n"),
	);
});

test("fence: unknown language falls back to flat yellow", () => {
	expect(highlightMarkdown("```brainfuck\n+++\n```")).toBe(
		[kleur.dim("```brainfuck"), kleur.yellow("+++"), kleur.dim("```")].join("\n"),
	);
});

test("fence: a multi-line token closes its style on every line", () => {
	expect(highlightMarkdown("```js\n/* a\nb */\n```")).toBe(
		[kleur.dim("```js"), kleur.dim("/* a"), kleur.dim("b */"), kleur.dim("```")].join("\n"),
	);
});

test("fence: inside a quote the prefix stays dim and no markdown rules run", () => {
	expect(highlightMarkdown("> ```\n> # not a heading\n>\n> ```\n> # heading")).toBe(
		[
			`${kleur.dim(">")} ${kleur.dim("```")}`,
			`${kleur.dim(">")} ${kleur.yellow("# not a heading")}`,
			kleur.dim(">"),
			`${kleur.dim(">")} ${kleur.dim("```")}`,
			`${kleur.dim(">")} ${kleur.bold().cyan("# heading")}`,
		].join("\n"),
	);
});

test("fence: indented inside a list item keeps the indent", () => {
	expect(highlightMarkdown("- a\n  ```\n  x\n  ```")).toBe(
		[
			`${kleur.dim("-")} a`,
			`  ${kleur.dim("```")}`,
			`  ${kleur.yellow("x")}`,
			`  ${kleur.dim("```")}`,
		].join("\n"),
	);
});

test("inline: bold nests inside italic", () => {
	expect(highlightMarkdown("*a **b** c*")).toBe(kleur.italic(`*a ${kleur.bold("**b**")} c*`));
});

test("inline: code inside link text is still a link", () => {
	expect(highlightMarkdown("[`x`](u)")).toBe(
		`${kleur.dim("[")}${kleur.yellow("`x`")}${kleur.dim("](")}${kleur.dim().underline("u")}${kleur.dim(")")}`,
	);
});

test("inline: a link inside a code span stays code", () => {
	expect(highlightMarkdown("`[a](b)`")).toBe(kleur.yellow("`[a](b)`"));
});

test("inline: a url with parentheses keeps them", () => {
	expect(highlightMarkdown("[w](https://x/Foo_(bar))")).toBe(
		`${kleur.dim("[")}w${kleur.dim("](")}${kleur.dim().underline("https://x/Foo_(bar)")}${kleur.dim(")")}`,
	);
});

test("fence: opened right after a list marker with unindented code", () => {
	expect(highlightMarkdown("- ```\nx\n```\n- **b**")).toBe(
		[
			`${kleur.dim("-")} ${kleur.dim("```")}`,
			kleur.yellow("x"),
			kleur.dim("```"),
			`${kleur.dim("-")} ${kleur.bold("**b**")}`,
		].join("\n"),
	);
});

test("fence: empty block adds no blank line", () => {
	expect(highlightMarkdown("```\n```")).toBe([kleur.dim("```"), kleur.dim("```")].join("\n"));
});

test("fence: unterminated block runs to the end as code", () => {
	expect(highlightMarkdown("```\n# a\n# b")).toBe(
		[kleur.dim("```"), kleur.yellow("# a"), kleur.yellow("# b")].join("\n"),
	);
});
