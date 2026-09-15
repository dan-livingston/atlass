export function normalized(raw: string): string {
	return raw.replace(/^﻿/, "").replace(/\r\n/g, "\n");
}
