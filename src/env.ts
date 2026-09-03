import type { AtlassianSession } from "#/api/session.ts";
import type { Terminal } from "#/terminal.ts";

export interface Env {
	term: Terminal;
}

export interface SessionEnv<Session = AtlassianSession> extends Env {
	session: Session;
}
