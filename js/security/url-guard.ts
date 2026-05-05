// URL safety guard shared by the toast bridge and the XHR error interceptor.
//
// Wraps `@braintree/sanitize-url` to reject `javascript:` / `data:` /
// `vbscript:` / scheme-less injection attempts, then layers a same-origin
// check on top so URLs from server payloads can't redirect users off-app.

import { sanitizeUrl } from "@braintree/sanitize-url";

/**
 * Returns `true` if `url` is safe to navigate to.
 *
 * - Rejects URLs whose scheme `sanitizeUrl` flags as unsafe (returns `about:blank`).
 * - When `allowedOrigin` is provided, the resolved URL's origin must match.
 *   Relative paths resolve against `allowedOrigin` and are accepted as same-origin.
 */
export function isSafeUrl(url: string, allowedOrigin?: string): boolean {
	if (sanitizeUrl(url) === "about:blank") {
		return false;
	}
	if (!allowedOrigin) {
		return true;
	}
	try {
		const parsed = new URL(url, allowedOrigin);
		return parsed.origin === new URL(allowedOrigin).origin;
	} catch {
		return false;
	}
}
