import type { Command } from "commander";

import { run } from "#/cli/run.ts";
import { login, logout, status } from "#/commands/auth.ts";

export function registerAuth(auth: Command): Command {
	auth.description("Manage Atlassian credentials");
	auth.command("login").description("Store site, email, and API token").action(run(login));
	auth.command("logout").description("Remove stored credentials").action(run(logout));
	auth.command("status").description("Show the current login").action(run(status));
	return auth;
}
