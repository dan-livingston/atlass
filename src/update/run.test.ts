import { expect, test } from "vite-plus/test";

import type { UpdatePlan, Verdict } from "#/update/plan.ts";

import { scriptedTerminal } from "#/terminal/scripted.ts";
import { runPlan } from "#/update/run.ts";

function plan(verdict: Verdict): UpdatePlan {
	return {
		noun: "issue",
		id: "PROJ-7",
		headline: { label: "summary", current: "Login broken", next: "Login broken" },
		revision: { local: "v1", server: "v1", stale: false },
		lossy: new Map(),
		images: [],
		uploads: [],
		body: { type: "doc", version: 1, content: [] },
		refusals: [],
		verdict,
	};
}

function pushCounter() {
	let pushed = 0;
	return { count: () => pushed, push: async () => void pushed++ };
}

test("a proceed verdict pushes without asking anything", async () => {
	const term = scriptedTerminal();
	const { count, push } = pushCounter();
	await runPlan(term, plan({ kind: "proceed" }), {}, push);

	expect(count()).toBe(1);
	expect(term.asked).toEqual([]);
});

test("a refuse verdict throws its message and never pushes", async () => {
	const term = scriptedTerminal();
	const { count, push } = pushCounter();
	await expect(
		runPlan(term, plan({ kind: "refuse", message: "Issue changed on the server." }), {}, push),
	).rejects.toThrow("Issue changed on the server.");

	expect(count()).toBe(0);
});

test("a confirm verdict pushes only when the answer is yes", async () => {
	const yes = scriptedTerminal({ answers: [true] });
	const first = pushCounter();
	await runPlan(
		yes,
		plan({ kind: "confirm", message: "Drop 2 tables. Continue?" }),
		{},
		first.push,
	);

	expect(first.count()).toBe(1);
	expect(yes.asked).toEqual([{ kind: "confirm", message: "Drop 2 tables. Continue?" }]);
	expect(yes.written).toEqual([]);
});

test("declining a confirm says so and leaves the issue alone", async () => {
	const no = scriptedTerminal({ answers: [false] });
	const { count, push } = pushCounter();
	await runPlan(no, plan({ kind: "confirm", message: "Continue?" }), {}, push);

	expect(count()).toBe(0);
	expect(no.written).toEqual(["Aborted."]);
});

test("a confirm with no terminal to ask points at the flag that would answer it", async () => {
	const term = scriptedTerminal();
	const { count, push } = pushCounter();
	await expect(
		runPlan(term, plan({ kind: "confirm", message: "Continue?" }), {}, push),
	).rejects.toThrow("Cannot prompt without a terminal. Pass --force.");

	expect(count()).toBe(0);
});

test("a dry run prints the plan and pushes nothing, whatever the verdict", async () => {
	const term = scriptedTerminal();
	const { count, push } = pushCounter();
	await runPlan(term, plan({ kind: "confirm", message: "Continue?" }), { dryRun: true }, push);

	expect(count()).toBe(0);
	expect(term.asked).toEqual([]);
	expect(term.written).toHaveLength(1);
	expect(term.written[0]).toContain("nothing was written (dry run)");
});
