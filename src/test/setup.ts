import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vite-plus/test";

const dir = mkdtempSync(join(tmpdir(), "atlass-config-"));
process.env.XDG_CONFIG_HOME = dir;

afterAll(() => {
	rmSync(dir, { recursive: true, force: true });
});
