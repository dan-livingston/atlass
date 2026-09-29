import { extname } from "node:path";

const BY_EXTENSION: Record<string, string> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".svg": "image/svg+xml",
	".pdf": "application/pdf",
	".txt": "text/plain",
	".log": "text/plain",
	".md": "text/markdown",
	".csv": "text/csv",
	".html": "text/html",
	".json": "application/json",
	".xml": "application/xml",
	".zip": "application/zip",
	".mp4": "video/mp4",
	".m4v": "video/mp4",
	".mov": "video/quicktime",
	".webm": "video/webm",
	".ogv": "video/ogg",
	".avi": "video/x-msvideo",
	".mkv": "video/x-matroska",
	".wmv": "video/x-ms-wmv",
	".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export function mediaType(filename: string): string | undefined {
	return BY_EXTENSION[extname(filename).toLowerCase()];
}

export function isVideo(href: string): boolean {
	const path = href.split(/[?#]/)[0] ?? "";
	return mediaType(path)?.startsWith("video/") ?? false;
}
