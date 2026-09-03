import { expect, test } from "vite-plus/test";

import { extractErrorMessage, httpError } from "#/api/http-error.ts";

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

test("auth failure: the message names the login command of the product that rejected it", () => {
	expect(httpError(401, "/rest/api/3/myself", "", "atlass auth login").message).toContain(
		"Run `atlass auth login`",
	);
	expect(httpError(403, "/2.0/user", "", "atlass bitbucket login").message).toContain(
		"Run `atlass bitbucket login`",
	);
});

test("bad request: jira field errors survive on the error for the create command to name them", () => {
	const err = httpError(400, "/rest/api/3/issue", '{"errors":{"summary":"required"}}', "x");
	expect(err.jira.errors).toEqual({ summary: "required" });
});
