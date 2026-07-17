// Format a pipeline duration (whole seconds) compactly. Null/missing (e.g. a
// run still in progress) renders as a dash.
export function formatDuration(seconds: number | null | undefined): string {
	if (seconds == null) return "-";
	if (seconds < 60) return `${seconds}s`;
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	if (m < 60) return `${m}m${String(s).padStart(2, "0")}s`;
	const h = Math.floor(m / 60);
	return `${h}h${String(m % 60).padStart(2, "0")}m`;
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Human "3d ago" style age of an ISO timestamp relative to nowMs (epoch millis,
// passed in so this stays pure). Future or unparseable inputs are handled
// gracefully rather than showing negative ages.
export function relativeTime(iso: string, nowMs: number): string {
	if (!iso) return "-";
	const then = Date.parse(iso);
	if (Number.isNaN(then)) return "-";
	const secs = Math.floor((nowMs - then) / 1000);
	if (secs < MINUTE) return "just now";
	if (secs < HOUR) return `${Math.floor(secs / MINUTE)}m ago`;
	if (secs < DAY) return `${Math.floor(secs / HOUR)}h ago`;
	const days = Math.floor(secs / DAY);
	if (days < 45) return `${days}d ago`;
	if (days < 365) return `${Math.floor(days / 30)}mo ago`;
	return `${Math.floor(days / 365)}y ago`;
}
