import type { AtlassianSession } from "#/api/session.ts";

export interface Env<Session = AtlassianSession> {
	session: Session;
}
