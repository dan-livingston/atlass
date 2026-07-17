import { expect, test } from "vite-plus/test";

import { parseIssueKey, parsePageId, resolveRepo } from "./parse.ts";

test("parseIssueKey from bare key", () => {
	expect(parseIssueKey("PROJ-123")).toBe("PROJ-123");
	expect(parseIssueKey("proj-123")).toBe("PROJ-123");
});

test("parseIssueKey from browse URL", () => {
	expect(parseIssueKey("https://acme.atlassian.net/browse/ABC-42")).toBe("ABC-42");
});

test("parseIssueKey from board URL query", () => {
	expect(
		parseIssueKey(
			"https://acme.atlassian.net/jira/software/projects/DEV/boards/1?selectedIssue=DEV-9",
		),
	).toBe("DEV-9");
});

test("parseIssueKey returns null when absent", () => {
	expect(parseIssueKey("not a key")).toBeNull();
});

test("parsePageId from bare id", () => {
	expect(parsePageId("123456")).toBe("123456");
});

test("parsePageId from page URL", () => {
	expect(parsePageId("https://acme.atlassian.net/wiki/spaces/DEV/pages/98765/My+Page")).toBe(
		"98765",
	);
});

test("parsePageId from pageId query", () => {
	expect(parsePageId("https://acme.atlassian.net/wiki/pages/viewpage.action?pageId=555")).toBe(
		"555",
	);
});

test("parsePageId returns null when absent", () => {
	expect(parsePageId("nope")).toBeNull();
});

test("resolveRepo: workspace/slug flag wins outright", () => {
	expect(resolveRepo("acme/web", { workspace: "other", defaultRepo: "api" })).toEqual({
		workspace: "acme",
		repo: "web",
	});
});

test("resolveRepo: bare slug flag uses the config workspace", () => {
	expect(resolveRepo("web", { workspace: "acme" })).toEqual({ workspace: "acme", repo: "web" });
});

test("resolveRepo: no flag falls back to the config default repo", () => {
	expect(resolveRepo(undefined, { workspace: "acme", defaultRepo: "web" })).toEqual({
		workspace: "acme",
		repo: "web",
	});
});

test("resolveRepo: no flag and no default is an error", () => {
	expect(() => resolveRepo(undefined, { workspace: "acme" })).toThrow(/--repo/);
});

test("resolveRepo: bare slug with no configured workspace is an error", () => {
	expect(() => resolveRepo("web", {})).toThrow(/workspace/);
});

test("resolveRepo: malformed workspace/slug is rejected", () => {
	expect(() => resolveRepo("acme/", { workspace: "acme" })).toThrow();
	expect(() => resolveRepo("/web", { workspace: "acme" })).toThrow();
	expect(() => resolveRepo("a/b/c", { workspace: "acme" })).toThrow();
});
