import { afterEach, expect, test } from "vite-plus/test";

import { login, logout, status } from "#/commands/auth.ts";
import { fakeEnv } from "#/test/env.ts";
import { stubFetch } from "#/test/http.ts";

const SITE = "https://acme.atlassian.net";
const MYSELF = `${SITE}/rest/api/3/myself`;

let http: ReturnType<typeof stubFetch> | undefined;

afterEach(() => {
	http?.restore();
	http = undefined;
});

function loginEnv(answers: unknown[], stored = {}) {
	http = stubFetch({ [MYSELF]: { displayName: "Ada Lovelace" } });
	return fakeEnv({ answers, profile: stored });
}

test("login stores the site and email, keeps the token in the profile, and greets the user", async () => {
	const env = loginEnv(["acme.atlassian.net", "ada@acme.com", "jira-token"]);
	await login(env);

	expect(await env.profile.read()).toEqual({ site: SITE, email: "ada@acme.com" });
	expect(await env.profile.token("ada@acme.com", "atlassian")).toBe("jira-token");
	expect(env.term.written).toEqual([`Logged in as Ada Lovelace on ${SITE}.`]);
});

test("login turns a bare host into an https origin before it is stored", async () => {
	const env = loginEnv(["ACME.atlassian.net/wiki/home", "ada@acme.com", "jira-token"]);
	await login(env);

	expect((await env.profile.read())?.site).toBe("https://acme.atlassian.net");
});

test("login verifies the credentials it was given before storing anything", async () => {
	const env = loginEnv(["acme.atlassian.net", "ada@acme.com", "jira-token"]);
	await login(env);

	expect(http?.requests).toHaveLength(1);
	expect(http?.requests[0]?.url).toBe(MYSELF);
	const expected = Buffer.from("ada@acme.com:jira-token").toString("base64");
	expect(http?.requests[0]?.authorization).toBe(`Basic ${expected}`);
});

test("login refuses to store credentials the site rejects", async () => {
	http = stubFetch({ [MYSELF]: () => new Response("nope", { status: 401 }) });
	const env = fakeEnv({ answers: ["acme.atlassian.net", "ada@acme.com", "wrong"] });

	await expect(login(env)).rejects.toThrow();
	expect(await env.profile.read()).toBeNull();
	expect(await env.profile.token("ada@acme.com", "atlassian")).toBeNull();
});

test("login leaves an existing bitbucket login alone", async () => {
	const env = loginEnv(["acme.atlassian.net", "ada@acme.com", "jira-token"], {
		config: { email: "ada@acme.com", bitbucket: { workspace: "acme" } },
	});
	await login(env);

	expect((await env.profile.read())?.bitbucket).toEqual({ workspace: "acme" });
});

test("logout removes the token and the whole config when only Jira was logged in", async () => {
	const env = fakeEnv({
		profile: {
			config: { site: SITE, email: "ada@acme.com" },
			tokens: { "ada@acme.com:atlassian": "t" },
		},
	});
	await logout(env);

	expect(await env.profile.read()).toBeNull();
	expect(await env.profile.token("ada@acme.com", "atlassian")).toBeNull();
	expect(env.term.written).toEqual(["Logged out. Credentials removed."]);
});

test("logout keeps the bitbucket half of the config and its token", async () => {
	const env = fakeEnv({
		profile: {
			config: { site: SITE, email: "ada@acme.com", bitbucket: { workspace: "acme" } },
			tokens: { "ada@acme.com:atlassian": "t", "ada@acme.com:bitbucket": "b" },
		},
	});
	await logout(env);

	expect(await env.profile.read()).toEqual({
		email: "ada@acme.com",
		bitbucket: { workspace: "acme" },
	});
	expect(await env.profile.token("ada@acme.com", "bitbucket")).toBe("b");
});

test("status on a machine that has never logged in says so", async () => {
	const env = fakeEnv();
	await status(env);

	expect(env.term.written).toEqual(["Not logged in. Run `atlass auth login`."]);
});

test("status reports the site, the email and that the token is present", async () => {
	const env = fakeEnv({
		profile: {
			config: { site: SITE, email: "ada@acme.com" },
			tokens: { "ada@acme.com:atlassian": "t" },
		},
	});
	await status(env);

	expect(env.term.written[0]).toBe(
		[`Site:  ${SITE}`, "Email: ada@acme.com", "Token: stored in keyring"].join("\n"),
	);
});

test("status calls out a config with no matching token in the keyring", async () => {
	const env = fakeEnv({ profile: { config: { site: SITE, email: "ada@acme.com" } } });
	await status(env);

	expect(env.term.written[0]).toContain("Token: MISSING");
});
