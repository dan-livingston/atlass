import type { AtlassianSession } from "#/api/session.ts";
import type { Files } from "#/files.ts";
import type { Terminal } from "#/terminal.ts";

export interface Env {
	term: Terminal;
	files: Files;
}

export interface SessionEnv<Session = AtlassianSession> extends Env {
	session: Session;
}
