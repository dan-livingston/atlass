import kleur from "kleur";
import { expect, test } from "vite-plus/test";

import type {
	ChangedFile,
	PullRequestComment,
	PullRequestDetail,
} from "#/api/bitbucket-pr-detail.ts";
import type { CappedPage } from "#/api/bitbucket-repo.ts";

import { fileSection, formatPullRequestView, reviewerSection } from "#/commands/bitbucket-pr.ts";

kleur.enabled = false;

const NOW = Date.parse("2026-09-04T12:00:00Z");

function detail(over: Partial<PullRequestDetail> = {}): PullRequestDetail {
	return {
		id: 842,
		title: "Add rate limiting to the export endpoint",
		description: "Buckets per account.",
		state: "OPEN",
		draft: false,
		author: "Dana Reeve",
		sourceBranch: "feat/export-limits",
		destinationBranch: "main",
		closedBy: "",
		createdOn: "2026-08-28T09:00:00Z",
		updatedOn: "2026-09-03T16:00:00Z",
		url: "https://bitbucket.org/acme/web/pull-requests/842",
		reviewers: [
			{ name: "Dana Reeve", state: "APPROVED" },
			{ name: "Sam Okafor", state: "CHANGES_REQUESTED" },
			{ name: "Priya Raman", state: "" },
		],
		participants: [
			{ accountId: "acc-dana", name: "Dana Reeve" },
			{ accountId: "acc-sam", name: "Sam Okafor" },
		],
		...over,
	};
}

let nextId = 0;

function comment(over: Partial<PullRequestComment> = {}): PullRequestComment {
	return {
		id: ++nextId,
		parentId: null,
		author: "Sam Okafor",
		created: "2026-09-02T14:20:00Z",
		body: "This leaks the bucket when the request throws.",
		anchor: "",
		resolved: null,
		...over,
	};
}

function page<T>(items: T[], over: Partial<CappedPage<T>> = {}): CappedPage<T> {
	return { items, total: items.length, truncated: false, ...over };
}

const FILES: ChangedFile[] = [
	{ path: "src/api/rate-limit.ts", status: "added", added: 120, removed: 4 },
	{ path: "src/api/client.ts", status: "modified", added: 48, removed: 12 },
	{ path: "README.md", status: "modified", added: 5, removed: 0 },
];

function view(
	over: Partial<PullRequestDetail> = {},
	comments: PullRequestComment[] = [comment()],
	files: ChangedFile[] = FILES,
): string[] {
	return formatPullRequestView(detail(over), page(comments), page(files), NOW);
}

test("the header lays out every field in a fixed order with aligned labels", () => {
	expect(view().slice(0, 8)).toEqual([
		"Add rate limiting to the export endpoint",
		"State:      OPEN",
		"Author:     Dana Reeve",
		"Branch:     feat/export-limits → main",
		"Approvals:  1/3",
		"Created:    2026-08-28 (7d ago)",
		"Updated:    2026-09-04 (20h ago)",
		"URL:        https://bitbucket.org/acme/web/pull-requests/842",
	]);
});

test("a draft says so in place of its open state", () => {
	expect(view({ draft: true })[1]).toBe("State:      DRAFT");
});

test("closed by appears only once someone closed it", () => {
	expect(view().join("\n")).not.toContain("Closed by");
	expect(view({ state: "MERGED", closedBy: "Ada" }).join("\n")).toContain("Closed by:  Ada");
});

test("an empty description drops the body rather than printing a blank", () => {
	const lines = view({ description: "" });
	expect(lines[8]).toBe("");
	expect(lines[9]).toBe("Reviewers");
});

test("reviewers are listed with aligned names, a pending one shown as a dash", () => {
	expect(reviewerSection(detail().reviewers)).toEqual([
		"",
		"Reviewers",
		"  Dana Reeve   APPROVED",
		"  Sam Okafor   CHANGES_REQUESTED",
		"  Priya Raman  —",
	]);
});

test("no reviewers reads as unassigned rather than vanishing, and approvals say 0/0", () => {
	expect(reviewerSection([])).toEqual(["", "Reviewers", "  None assigned"]);
	expect(view({ reviewers: [] })[4]).toBe("Approvals:  0/0");
});

test("files are counted and totalled, with the columns right aligned", () => {
	expect(fileSection(page(FILES))).toEqual([
		"",
		"Files (3, +173 -16)",
		"  +120   -4  src/api/rate-limit.ts",
		"   +48  -12  src/api/client.ts",
		"    +5   -0  README.md",
	]);
});

test("no changed files drops the section", () => {
	expect(fileSection(page([]))).toEqual([]);
});

test("a capped file list says how many more there are", () => {
	expect(fileSection(page(FILES, { total: 46, truncated: true })).at(-1)).toBe(
		"  ... and 43 more",
	);
});

test("a capped file list with no total from the server still admits it is partial", () => {
	expect(fileSection(page(FILES, { total: undefined, truncated: true })).at(-1)).toBe(
		"  ... more files not shown",
	);
});

test("an inline comment is anchored to its file and line", () => {
	const lines = view({}, [comment({ anchor: "src/api/rate-limit.ts:88" })]);
	expect(lines.at(-2)).toBe("─ Sam Okafor · 2026-09-03 00:20 · src/api/rate-limit.ts:88");
	expect(lines.at(-1)).toBe("This leaks the bucket when the request throws.");
});

test("a reply is indented under its root, which keeps the only anchor", () => {
	const root = comment({ body: "root", anchor: "src/api/rate-limit.ts:88" });
	const reply = comment({
		author: "Dana Reeve",
		body: "reply",
		anchor: "src/api/rate-limit.ts:88",
		parentId: root.id,
		created: "2026-09-02T15:00:00Z",
	});
	expect(view({}, [root, reply]).slice(-5)).toEqual([
		"─ Sam Okafor · 2026-09-03 00:20 · src/api/rate-limit.ts:88",
		"root",
		"",
		"  ↳ Dana Reeve · 2026-09-03 01:00",
		"  reply",
	]);
});

test("a chain of replies flattens to a single level rather than a staircase", () => {
	const first = comment({ body: "one" });
	const second = comment({ body: "two", parentId: first.id });
	const third = comment({ body: "three", parentId: second.id });
	const lines = view({}, [first, second, third]);
	expect(lines.filter((line) => line.startsWith("  ↳"))).toHaveLength(2);
	expect(lines).toContain("  three");
});

test("a resolved thread closes with who resolved it and when", () => {
	const root = comment({
		body: "root",
		resolved: { by: "Dana Reeve", at: "2026-09-02T16:00:00Z" },
	});
	const reply = comment({ body: "reply", parentId: root.id });
	expect(view({}, [root, reply]).at(-1)).toBe("  ↳ resolved by Dana Reeve · 2026-09-03 02:00");
});

test("a mention resolves to a participant name and an unknown one is left alone", () => {
	const lines = view({}, [comment({ body: "@{acc-dana} and @{acc-ghost} please look" })]);
	expect(lines.at(-1)).toBe("@Dana Reeve and @{acc-ghost} please look");
});

test("threads are truncated whole, and the heading counts both comments and threads", () => {
	const roots = Array.from({ length: 7 }, (_, i) =>
		comment({ body: `note ${i}`, created: `2026-09-0${i + 1}T10:00:00Z` }),
	);
	const reply = comment({
		body: "tail",
		parentId: roots[6].id,
		created: "2026-09-07T11:00:00Z",
	});
	const lines = formatPullRequestView(detail(), page([...roots, reply]), page(FILES), NOW);
	expect(lines).toContain(
		"Comments (8 in 7 threads, showing last 5 threads — --all-comments for all)",
	);
	expect(lines).not.toContain("note 1");
	expect(lines).toContain("  tail");
});

test("a reply whose parent was dropped stands on its own rather than vanishing", () => {
	const orphan = comment({ body: "orphan", parentId: 9999 });
	const lines = view({}, [orphan]);
	expect(lines.at(-2)).toBe("─ Sam Okafor · 2026-09-03 00:20");
	expect(lines.at(-1)).toBe("orphan");
});

test("only the last five comments show, with the count and a hint to see the rest", () => {
	const many = Array.from({ length: 7 }, (_, i) =>
		comment({ body: `note ${i}`, created: `2026-09-0${i + 1}T10:00:00Z` }),
	);
	const lines = formatPullRequestView(detail(), page(many), page(FILES), NOW);
	expect(lines).toContain("Comments (7, showing last 5 — --all-comments for all)");
	expect(lines).not.toContain("note 1");
	expect(lines).toContain("note 6");
});

test("--all-comments shows every one", () => {
	const many = Array.from({ length: 7 }, (_, i) => comment({ body: `note ${i}` }));
	const lines = formatPullRequestView(detail(), page(many), page(FILES), NOW, true);
	expect(lines).toContain("Comments (7)");
	expect(lines).toContain("note 1");
});

test("a capped comment walk marks the count as a floor", () => {
	const lines = formatPullRequestView(
		detail(),
		page([comment()], { truncated: true }),
		page(FILES),
		NOW,
	);
	expect(lines).toContain("Comments (1+)");
});

test("files the token cannot read say so instead of vanishing", () => {
	expect(fileSection(null)).toEqual([
		"",
		"Files",
		"  Unavailable: the token needs the read:repository:bitbucket scope.",
	]);
});
