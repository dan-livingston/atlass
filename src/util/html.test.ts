import { expect, test } from "vite-plus/test";

import { decodeEntities } from "./html.ts";

test("decodes named entities", () => {
	expect(decodeEntities("Login &amp; account &lt;merge&gt;")).toBe("Login & account <merge>");
});

test("decodes quotes and apostrophes", () => {
	expect(decodeEntities("&quot;L&apos;audio&quot;")).toBe('"L\'audio"');
});

test("decodes numeric entities", () => {
	expect(decodeEntities("caf&#233; &#x1F600;")).toBe("café 😀");
});

test("leaves plain text and unknown entities untouched", () => {
	expect(decodeEntities("100% &bogus; done")).toBe("100% &bogus; done");
});

test("leaves out-of-range numeric entities untouched instead of throwing", () => {
	expect(decodeEntities("a &#9999999; b")).toBe("a &#9999999; b");
	expect(decodeEntities("a &#x110000; b")).toBe("a &#x110000; b");
});
