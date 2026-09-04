import { expect, test } from "vite-plus/test";

import { buildCql, searchPages, searchPagesByCql } from "#/api/confluence-search.ts";
import { fakeSession } from "#/test/session.ts";

test("cql: friendly mode always constrains to pages", () => {
	expect(buildCql({ limit: 25 })).toBe("type = page ORDER BY lastmodified DESC");
});

test("cql: space and text are AND'd after type", () => {
	expect(buildCql({ space: ["DOCS"], text: "onboarding", limit: 25 })).toBe(
		'type = page AND space = "DOCS" AND text ~ "onboarding" ORDER BY lastmodified DESC',
	);
});

test("cql: a repeated filter is OR'd within itself", () => {
	expect(buildCql({ space: ["DOCS", "ENG"], limit: 25 })).toBe(
		'type = page AND space in ("DOCS", "ENG") ORDER BY lastmodified DESC',
	);
});

test("cql: labels filter alongside the rest", () => {
	expect(buildCql({ label: ["runbook", "oncall"], limit: 25 })).toBe(
		'type = page AND label in ("runbook", "oncall") ORDER BY lastmodified DESC',
	);
});

test("cql: updated is a floor on an absolute date", () => {
	expect(buildCql({ updatedSince: "2026-08-28", limit: 25 })).toBe(
		'type = page AND lastmodified >= "2026-08-28" ORDER BY lastmodified DESC',
	);
});

test("cql: starred lists the current user's favourites, still constrained to pages", () => {
	expect(buildCql({ starred: true, space: ["DOCS"], limit: 25 })).toBe(
		'type = page AND favourite = currentUser() AND space = "DOCS" ORDER BY lastmodified DESC',
	);
});

test("cql search: a full server page means more results, even when rows without a content id are dropped", async () => {
	const client = fakeSession({
		getJson: async () => ({
			results: [{ content: { id: "1", title: "A" } }, { title: "orphan result" }],
		}),
	});
	const res = await searchPages(client, "https://acme.atlassian.net", { limit: 2 });
	expect(res.pages.map((p) => p.id)).toEqual(["1"]);
	expect(res.hasMore).toBe(true);
});

test("cql search: last modified is carried through as updated", async () => {
	const client = fakeSession({
		getJson: async () => ({
			results: [
				{ content: { id: "1", title: "A" }, lastModified: "2026-08-30T10:00:00.000Z" },
				{ content: { id: "2", title: "B" } },
			],
		}),
	});
	const res = await searchPages(client, "https://acme.atlassian.net", { limit: 25 });
	expect(res.pages.map((p) => p.updated)).toEqual(["2026-08-30T10:00:00.000Z", ""]);
});

test("cql search: a raw query reaches the server untouched, ORDER BY included", async () => {
	const paths: string[] = [];
	const client = fakeSession({
		getJson: async (path: string) => {
			paths.push(path);
			return { results: [] };
		},
	});
	const raw = "label = runbook ORDER BY created";
	await searchPagesByCql(client, "https://acme.atlassian.net", raw, 25);
	expect(new URL(paths[0]!, "https://x").searchParams.get("cql")).toBe(raw);
});
