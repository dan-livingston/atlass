import { expect, test } from "vite-plus/test";

import { pagerCommand, renderedHeight, shouldPage, tryPager } from "#/terminal/pager.ts";

test("renderedHeight: counts each line once when nothing wraps", () => {
	expect(renderedHeight("a\nb\nc", 80)).toBe(3);
});

test("renderedHeight: empty lines still take a row", () => {
	expect(renderedHeight("a\n\nb", 80)).toBe(3);
});

test("renderedHeight: wide lines wrap by visible width, ignoring ANSI codes", () => {
	expect(renderedHeight("x".repeat(100), 40)).toBe(3);
	expect(renderedHeight(`[1m${"x".repeat(40)}[22m`, 40)).toBe(1);
});

test("shouldPage: only when a TTY and the text is taller than the terminal", () => {
	const tall = Array.from({ length: 30 }, () => "line").join("\n");
	expect(shouldPage(tall, { isTTY: true, rows: 24, columns: 80 })).toBe(true);
	expect(shouldPage(tall, { isTTY: true, rows: 40, columns: 80 })).toBe(false);
	expect(shouldPage(tall, { isTTY: false, rows: 24, columns: 80 })).toBe(false);
});

test("shouldPage: falls back to a 24x80 terminal when size is unknown", () => {
	const tall = Array.from({ length: 30 }, () => "line").join("\n");
	expect(shouldPage(tall, { isTTY: true })).toBe(true);
	expect(shouldPage("short", { isTTY: true })).toBe(false);
});

test("pagerCommand: defaults to less with FRX when nothing is configured", () => {
	const { command, args, env } = pagerCommand({ PATH: "/usr/bin" });
	expect(command).toBe("less");
	expect(args).toEqual([]);
	expect(env["LESS"]).toBe("FRX");
	expect(env["PATH"]).toBe("/usr/bin");
});

test("pagerCommand: honours PAGER, splitting arguments on whitespace", () => {
	const { command, args } = pagerCommand({ PAGER: "less -S  --tabs=4" });
	expect(command).toBe("less");
	expect(args).toEqual(["-S", "--tabs=4"]);
});

test("pagerCommand: leaves a user's LESS alone", () => {
	expect(pagerCommand({ LESS: "-i" }).env["LESS"]).toBe("-i");
});

test("pagerCommand: an empty PAGER means the default", () => {
	expect(pagerCommand({ PAGER: "  " }).command).toBe("less");
});

const TALL = Array.from({ length: 5 }, (_, i) => `line ${i}`).join("\n");
const TINY = { isTTY: true, rows: 2, columns: 80 };

test("tryPager: says it did not page when the pager cannot be spawned", async () => {
	const paged = await tryPager(TALL, {
		screen: TINY,
		env: { PAGER: "atlass-no-such-pager-xyz" },
	});
	expect(paged).toBe(false);
});

test("tryPager: says it did not page when nothing would scroll", async () => {
	expect(await tryPager("short", { screen: TINY, env: {} })).toBe(false);
	expect(await tryPager(TALL, { screen: { isTTY: false }, env: {} })).toBe(false);
});

test("tryPager: counts a pager that exits without reading its input as paged", async () => {
	const paged = await tryPager(TALL, {
		screen: TINY,
		env: { ...process.env, PAGER: "node -e 0" },
	});
	expect(paged).toBe(true);
});
