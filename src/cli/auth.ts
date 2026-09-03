import type { Command } from "commander";

import { bareAction } from "#/cli/run.ts";
import { login, logout, status } from "#/commands/auth.ts";

export function registerAuth(auth: Command): Command {
	auth.description("Manage Atlassian credentials");
	auth.command("login").description("Store site, email, and API token").action(bareAction(login));
	auth.command("logout").description("Remove stored credentials").action(bareAction(logout));
	auth.command("status").description("Show the current login").action(bareAction(status));
	return auth;
}
