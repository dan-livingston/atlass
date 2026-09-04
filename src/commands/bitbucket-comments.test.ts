import kleur from "kleur";
import { expect, test } from "vite-plus/test";

import type { PullRequestComment } from "#/api/bitbucket-pr-detail.ts";

import { renderedPrComments, resolveMentions, threadsOf } from "#/commands/bitbucket-comments.ts";

kleur.enabled = false;

function comment(over: Partial<PullRequestComment> & { id: number }): PullRequestComment {
	return {
		parentId: null,
		author: "Sam Okafor",
		created: "2026-09-02T14:20:00Z",
		body: "note",
		anchor: "",
		resolved: null,
		...over,
	};
}

function ids(threads: PullRequestComment[][]): number[][] {
	return threads.map((thread) => thread.map((entry) => entry.id));
}

test("a chain of replies collapses into one thread in the order it was written", () => {
	const threads = threadsOf([
		comment({ id: 1 }),
		comment({ id: 2, parentId: 1 }),
		comment({ id: 3, parentId: 2 }),
		comment({ id: 4, parentId: 3 }),
	]);
	expect(ids(threads)).toEqual([[1, 2, 3, 4]]);
});

test("threads keep the order their roots were written in, not their latest reply", () => {
	const threads = threadsOf([
		comment({ id: 1 }),
		comment({ id: 2 }),
		comment({ id: 3, parentId: 1 }),
	]);
	expect(ids(threads)).toEqual([[1, 3], [2]]);
});

test("a reply whose parent is missing becomes a thread of its own", () => {
	expect(ids(threadsOf([comment({ id: 5, parentId: 404 })]))).toEqual([[5]]);
});

test("a parent cycle terminates rather than spinning", () => {
	const threads = threadsOf([comment({ id: 1, parentId: 2 }), comment({ id: 2, parentId: 1 })]);
	expect(threads.flat()).toHaveLength(2);
});

test("a chain renders as one thread where only the root keeps the anchor", () => {
	const threads = renderedPrComments(
		[
			comment({ id: 1, anchor: "a.ts:1" }),
			comment({ id: 2, parentId: 1, anchor: "a.ts:1" }),
			comment({ id: 3, parentId: 2, anchor: "a.ts:1" }),
		],
		[],
	);
	expect(threads).toHaveLength(1);
	expect(threads[0].map((row) => row.anchor)).toEqual(["a.ts:1", undefined, undefined]);
});

test("the resolved line hangs off the last comment in the thread", () => {
	const [thread] = renderedPrComments(
		[
			comment({ id: 1, resolved: { by: "Dana Reeve", at: "2026-09-02T16:00:00Z" } }),
			comment({ id: 2, parentId: 1 }),
		],
		[],
	);
	expect(thread[0].trailer).toBeUndefined();
	expect(thread[1].trailer).toBe("  ↳ resolved by Dana Reeve · 2026-09-03 02:00");
});

test("a resolution with no named resolver still reports when it happened", () => {
	const [thread] = renderedPrComments(
		[comment({ id: 1, resolved: { by: "", at: "2026-09-02T16:00:00Z" } })],
		[],
	);
	expect(thread[0].trailer).toBe("  ↳ resolved · 2026-09-03 02:00");
});

test("mentions swap in a known name and leave an unknown account id alone", () => {
	const names = new Map([["acc-1", "Dana Reeve"]]);
	expect(resolveMentions("cc @{acc-1} and @{acc-2}", names)).toBe("cc @Dana Reeve and @{acc-2}");
});

test("a body with no mentions is returned untouched", () => {
	expect(resolveMentions("plain text", new Map([["acc-1", "Dana"]]))).toBe("plain text");
});
