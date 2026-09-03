import { expect, test, vi } from "vite-plus/test";

import { ttyTerminal } from "#/terminal/tty.ts";

function captureLog(fn: () => void | Promise<void>) {
	const log = vi.spyOn(console, "log").mockImplementation(() => {});
	const error = vi.spyOn(console, "error").mockImplementation(() => {});
	return Promise.resolve(fn())
		.then(() => ({ log: log.mock.calls, error: error.mock.calls }))
		.finally(() => {
			log.mockRestore();
			error.mockRestore();
		});
}

test("out writes a block of lines as one call, so piping sees one write", async () => {
	const { log } = await captureLog(() => ttyTerminal().out(["a", "b", "c"]));
	expect(log).toEqual([["a\nb\nc"]]);
});

test("out writes nothing at all for an empty block", async () => {
	const { log } = await captureLog(() => ttyTerminal().out([]));
	expect(log).toEqual([]);
});

test("err writes to stderr, not stdout", async () => {
	const { log, error } = await captureLog(() => ttyTerminal().err("Fetching PROJ-7 ..."));
	expect(error).toEqual([["Fetching PROJ-7 ..."]]);
	expect(log).toEqual([]);
});

test("json pretty-prints at two spaces", async () => {
	const { log } = await captureLog(() => ttyTerminal().json({ key: "PROJ-7" }));
	expect(log).toEqual([['{\n  "key": "PROJ-7"\n}']]);
});

test("page prints directly when paging is refused or nothing would scroll", async () => {
	const { log } = await captureLog(async () => {
		const term = ttyTerminal();
		await term.page("long", { pager: false });
		await term.page("short");
	});
	expect(log).toEqual([["long"], ["short"]]);
});

test("width falls back to 80 when the stream reports no size", () => {
	const columns = process.stdout.columns;
	try {
		Object.defineProperty(process.stdout, "columns", { value: undefined, configurable: true });
		expect(ttyTerminal().width).toBe(80);
	} finally {
		Object.defineProperty(process.stdout, "columns", { value: columns, configurable: true });
	}
});
