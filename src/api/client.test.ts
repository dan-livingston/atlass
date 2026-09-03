import { expect, test } from "vite-plus/test";

import { extractErrorMessage, pathAndQuery } from "#/api/client.ts";

test("error message: jira and confluence report errorMessages or message", () => {
	expect(extractErrorMessage('{"errorMessages":["a","b"]}')).toBe("a; b");
	expect(extractErrorMessage('{"message":"nope"}')).toBe("nope");
});

test("error message: jira per-field errors are listed by field id after the general messages", () => {
	expect(
		extractErrorMessage(
			'{"errorMessages":["Priority is required"],"errors":{"customfield_10011":"Severity is required."}}',
		),
	).toBe("Priority is required; customfield_10011: Severity is required.");
});

test("error message: bitbucket nests the message under error", () => {
	expect(extractErrorMessage('{"error":{"message":"bad token"}}')).toBe("bad token");
});

test("error message: a non-JSON body is returned raw, truncated", () => {
	expect(extractErrorMessage("<html>oops</html>")).toBe("<html>oops</html>");
	expect(extractErrorMessage("x".repeat(400))).toHaveLength(300);
});

test("pathAndQuery: reduces an absolute URL to what the client appends to its origin", () => {
	expect(pathAndQuery("https://api.bitbucket.org/2.0/repos?page=2")).toBe("/2.0/repos?page=2");
});
