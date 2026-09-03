import { afterEach, expect, test } from "vite-plus/test";

import { bitbucketLogin, bitbucketLogout, bitbucketStatus } from "#/commands/bitbucket-auth.ts";
import { fakeEnv } from "#/test/env.ts";
import { stubFetch } from "#/test/http.ts";

const API = "https://api.bitbucket.org";
const WORKSPACE = `${API}/2.0/workspaces/acme`;
const USER = `${API}/2.0/user`;
const UUID = "{01234567-89ab-cdef-0123-456789abcdef}";

let http: ReturnType<typeof stubFetch> | undefined;

afterEach(() => {
	http?.restore();
	http = undefined;
});

const ANSWERS = ["ada@acme.com", "acme", "api", "bb-token"];

test("login stores the workspace, the default repo and the uuid it looked up", async () => {
	http = stubFetch({ [WORKSPACE]: { name: "Acme Inc" }, [USER]: { uuid: UUID } });
	const env = fakeEnv({ answers: ANSWERS });
	await bitbucketLogin(env);

	expect(await env.profile.read()).toEqual({
		email: "ada@acme.com",
		bitbucket: { workspace: "acme", defaultRepo: "api", uuid: UUID },
	});
	expect(await env.profile.token("ada@acme.com", "bitbucket")).toBe("bb-token");
	expect(env.term.written).toEqual([
		"Logged in to Bitbucket workspace Acme Inc as ada@acme.com.",
	]);
});

test("login takes the email from an existing Jira login instead of prompting for it", async () => {
	http = stubFetch({ [WORKSPACE]: { name: "Acme Inc" }, [USER]: { uuid: UUID } });
	const env = fakeEnv({
		answers: ["acme", "api", "bb-token"],
		profile: { config: { site: "https://acme.atlassian.net", email: "ada@acme.com" } },
	});
	await bitbucketLogin(env);

	expect(env.term.asked.map((a) => a.message)).not.toContain("Account email:");
	expect((await env.profile.read())?.email).toBe("ada@acme.com");
});

test("login omits the default repo when the prompt is left blank", async () => {
	http = stubFetch({ [WORKSPACE]: { name: "Acme Inc" }, [USER]: { uuid: UUID } });
	const env = fakeEnv({ answers: ["ada@acme.com", "acme", "  ", "bb-token"] });
	await bitbucketLogin(env);

	expect((await env.profile.read())?.bitbucket).toEqual({ workspace: "acme", uuid: UUID });
});

test("login still succeeds when the account scope is missing and no uuid comes back", async () => {
	http = stubFetch({
		[WORKSPACE]: { name: "Acme Inc" },
		[USER]: () => new Response("nope", { status: 403 }),
	});
	const env = fakeEnv({ answers: ANSWERS });
	await bitbucketLogin(env);

	expect((await env.profile.read())?.bitbucket).toEqual({
		workspace: "acme",
		defaultRepo: "api",
	});
});

test("login names the slug when the workspace does not exist, and stores nothing", async () => {
	http = stubFetch({ [WORKSPACE]: () => new Response("nope", { status: 404 }) });
	const env = fakeEnv({ answers: ANSWERS });

	await expect(bitbucketLogin(env)).rejects.toThrow('Bitbucket workspace "acme" not found (404)');
	expect(await env.profile.read()).toBeNull();
	expect(await env.profile.token("ada@acme.com", "bitbucket")).toBeNull();
});

test("login points at the scopes when the token is rejected", async () => {
	http = stubFetch({ [WORKSPACE]: () => new Response("nope", { status: 401 }) });
	const env = fakeEnv({ answers: ANSWERS });

	await expect(bitbucketLogin(env)).rejects.toThrow("read:pipeline:bitbucket");
});

test("logout keeps the Jira half of the config and drops only the bitbucket token", async () => {
	const env = fakeEnv({
		profile: {
			config: {
				site: "https://acme.atlassian.net",
				email: "ada@acme.com",
				bitbucket: { workspace: "acme" },
			},
			tokens: { "ada@acme.com:atlassian": "t", "ada@acme.com:bitbucket": "b" },
		},
	});
	await bitbucketLogout(env);

	expect(await env.profile.read()).toEqual({
		site: "https://acme.atlassian.net",
		email: "ada@acme.com",
	});
	expect(await env.profile.token("ada@acme.com", "atlassian")).toBe("t");
	expect(await env.profile.token("ada@acme.com", "bitbucket")).toBeNull();
});

test("logout clears the config entirely when Bitbucket was the only login", async () => {
	const env = fakeEnv({
		profile: {
			config: { email: "ada@acme.com", bitbucket: { workspace: "acme" } },
			tokens: { "ada@acme.com:bitbucket": "b" },
		},
	});
	await bitbucketLogout(env);

	expect(await env.profile.read()).toBeNull();
	expect(env.term.written).toEqual(["Logged out of Bitbucket. Credentials removed."]);
});

test("status without a bitbucket login points at the login command", async () => {
	const env = fakeEnv({ profile: { config: { email: "ada@acme.com" } } });
	await bitbucketStatus(env);

	expect(env.term.written).toEqual(["Not logged in to Bitbucket. Run `atlass bitbucket login`."]);
});

test("status reports the workspace, the default repo and the token", async () => {
	const env = fakeEnv({
		profile: {
			config: {
				email: "ada@acme.com",
				bitbucket: { workspace: "acme", defaultRepo: "api" },
			},
			tokens: { "ada@acme.com:bitbucket": "b" },
		},
	});
	await bitbucketStatus(env);

	expect(env.term.written[0]).toBe(
		[
			"Workspace:    acme",
			"Email:        ada@acme.com",
			"Default repo: api",
			"Token:        stored in keyring",
		].join("\n"),
	);
});

test("status says when no default repo has been set", async () => {
	const env = fakeEnv({
		profile: {
			config: { email: "ada@acme.com", bitbucket: { workspace: "acme" } },
		},
	});
	await bitbucketStatus(env);

	expect(env.term.written[0]).toContain("Default repo: (none)");
});
