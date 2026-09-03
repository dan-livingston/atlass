import type { AtlassianSession } from "#/api/session.ts";
import type { Terminal } from "#/terminal.ts";

export interface Env<Session = AtlassianSession> {
	session: Session;
	term: Terminal;
}
