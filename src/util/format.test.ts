import { expect, test } from "vite-plus/test";

import { formatDuration, relativeTime } from "./format.ts";

test("duration: null or missing renders as a dash", () => {
	expect(formatDuration(null)).toBe("-");
	expect(formatDuration(undefined)).toBe("-");
});

test("duration: under a minute is bare seconds", () => {
	expect(formatDuration(0)).toBe("0s");
	expect(formatDuration(45)).toBe("45s");
});

test("duration: minutes zero-pad the seconds", () => {
	expect(formatDuration(154)).toBe("2m34s");
	expect(formatDuration(62)).toBe("1m02s");
});

test("duration: hours zero-pad the minutes and drop seconds", () => {
	expect(formatDuration(3720)).toBe("1h02m");
	expect(formatDuration(7325)).toBe("2h02m");
});

const NOW = Date.parse("2026-07-17T12:00:00Z");

test("relativeTime: under a minute is just now", () => {
	expect(relativeTime("2026-07-17T11:59:30Z", NOW)).toBe("just now");
});

test("relativeTime: minutes, hours, days ago", () => {
	expect(relativeTime("2026-07-17T11:55:00Z", NOW)).toBe("5m ago");
	expect(relativeTime("2026-07-17T09:00:00Z", NOW)).toBe("3h ago");
	expect(relativeTime("2026-07-14T12:00:00Z", NOW)).toBe("3d ago");
});

test("relativeTime: weeks collapse into days, then months and years", () => {
	expect(relativeTime("2026-06-17T12:00:00Z", NOW)).toBe("30d ago");
	expect(relativeTime("2026-01-17T12:00:00Z", NOW)).toBe("6mo ago");
	expect(relativeTime("2024-07-17T12:00:00Z", NOW)).toBe("2y ago");
});

test("relativeTime: a future time clamps to just now", () => {
	expect(relativeTime("2026-07-17T12:05:00Z", NOW)).toBe("just now");
});

test("relativeTime: empty or unparseable renders as a dash", () => {
	expect(relativeTime("", NOW)).toBe("-");
	expect(relativeTime("not a date", NOW)).toBe("-");
});
