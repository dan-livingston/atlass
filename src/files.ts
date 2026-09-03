export interface Files {
	readText(path: string): Promise<string>;
	readBytes(path: string): Promise<Uint8Array>;
	size(path: string): Promise<number>;
	writeText(path: string, text: string): Promise<void>;
	writeBytes(path: string, bytes: Uint8Array): Promise<void>;
}
