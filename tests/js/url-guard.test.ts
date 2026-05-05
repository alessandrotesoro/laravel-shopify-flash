import { describe, expect, it } from "vitest";
import { isSafeUrl } from "../../js/security/url-guard";

const ORIGIN = "https://myapp.test";

describe("isSafeUrl", () => {
	it("rejects javascript: URLs", () => {
		expect(isSafeUrl("javascript:alert(1)", ORIGIN)).toBe(false);
	});

	it("rejects data: URLs", () => {
		expect(isSafeUrl("data:text/html,<script>alert(1)</script>", ORIGIN)).toBe(false);
	});

	it("rejects vbscript: URLs", () => {
		expect(isSafeUrl("vbscript:msgbox(1)", ORIGIN)).toBe(false);
	});

	it("rejects scheme-relative URLs that resolve to a different origin", () => {
		expect(isSafeUrl("//attacker.com/foo", ORIGIN)).toBe(false);
	});

	it("rejects cross-origin http(s) URLs", () => {
		expect(isSafeUrl("https://attacker.com/foo", ORIGIN)).toBe(false);
	});

	it("accepts a relative path against the allowed origin", () => {
		expect(isSafeUrl("/admin/orders/1", ORIGIN)).toBe(true);
	});

	it("accepts an absolute URL on the allowed origin", () => {
		expect(isSafeUrl("https://myapp.test/dashboard", ORIGIN)).toBe(true);
	});

	it("accepts any well-formed URL when no allowed origin is given", () => {
		expect(isSafeUrl("https://anywhere.example/path")).toBe(true);
	});

	it("rejects unsafe schemes even without an allowed origin", () => {
		expect(isSafeUrl("javascript:alert(1)")).toBe(false);
	});
});
