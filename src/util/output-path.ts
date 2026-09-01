import { dirname, isAbsolute, join, resolve } from "node:path";

export interface OutputTarget {
	filePath: string;
	assetsDir: string;
	assetsDirName: string;
}

export function resolveOutput(defaultBase: string, out?: string): OutputTarget {
	let filePath: string;
	if (!out) {
		filePath = resolve(`${defaultBase}.md`);
	} else if (out.endsWith(".md")) {
		filePath = isAbsolute(out) ? out : resolve(out);
	} else {
		filePath = resolve(out, `${defaultBase}.md`);
	}

	const dir = dirname(filePath);
	const base = filePath.slice(dir.length + 1).replace(/\.md$/, "");
	const assetsDirName = `${base}.assets`;
	return { filePath, assetsDir: join(dir, assetsDirName), assetsDirName };
}

export function slugify(title: string): string {
	const slug = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 60)
		.replace(/-+$/g, "");
	return slug || "page";
}
