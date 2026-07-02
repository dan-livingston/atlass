import { dirname, isAbsolute, join, resolve } from "node:path";

export interface OutputTarget {
	// absolute path to the .md file
	filePath: string;
	// absolute path to the sibling assets directory
	assetsDir: string;
	// assets directory name, used for relative links inside the Markdown
	assetsDirName: string;
}

// Resolve where to write, given a default base name (no extension) and an
// optional --out. --out ending in .md is treated as a file path; anything else
// is treated as a target directory.
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

// Slugify a title for use in a filename.
export function slugify(title: string): string {
	const slug = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 60)
		.replace(/-+$/g, "");
	return slug || "page";
}
