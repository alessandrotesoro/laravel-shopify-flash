// XHR error → notices interceptor.
//
// Subscribes to Inertia v3's `http.onError(...)` and routes every failure into
// either the notices context (4xx/5xx that we own UX for) or — for transport-
// level failures with no response — a single direct toast call.
//
// Routing rules:
//   - HttpCancelledError              → silently ignored
//   - HttpResponseError, status 422   → silently ignored (Inertia owns it)
//   - HttpResponseError, status 401/419 → critical, non-dismissable banner +
//                                          `router.reload()` to the login flow
//   - HttpResponseError with envelope `{ banner: BannerPayload }` in the
//     response body → forward the banner to `add()`
//   - HttpResponseError without envelope → fallback banner; status-specific
//     messages for 403/413/429, generic "unexpected" for everything else
//   - HttpNetworkError                → toast bridge with `isError: true`
//
// Fallback strings ship in English; consumers wanting localized fallbacks
// pass a `fallbackMessages` prop overriding any subset.

import { HttpCancelledError, HttpNetworkError, HttpResponseError } from "@inertiajs/core";
import { http, router } from "@inertiajs/react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useRef } from "react";
import { asShopifyApi, showToast } from "../bridge/toast-bridge";
import { useNoticesContext } from "../components/NoticesProvider";
import { isSafeUrl } from "../security/url-guard";
import type { BannerAction, BannerPayload } from "../types";

interface BannerMessage {
	heading: string;
	description: string;
}

/**
 * Override fallback strings used when an XHR error has no envelope. Any field
 * left undefined falls back to the package's English defaults.
 */
export interface FallbackMessages {
	/** Toast text for `HttpNetworkError` (transport failures, no response). */
	networkError?: string;
	/** Banner used for 401 / 419 before reloading. */
	sessionExpired?: BannerMessage;
	/** Banner used for 403. */
	forbidden?: BannerMessage;
	/** Banner used for 429. */
	rateLimited?: BannerMessage;
	/** Banner used for 413. */
	fileTooLarge?: BannerMessage;
	/** Banner used for any other 4xx/5xx without an envelope. */
	unexpected?: BannerMessage;
}

const DEFAULT_MESSAGES: Required<FallbackMessages> = {
	networkError: "Network error. Check your connection and try again.",
	sessionExpired: {
		heading: "Your session has expired",
		description: "Reloading to sign you back in.",
	},
	forbidden: {
		heading: "You don’t have permission to do that",
		description: "If you think this is wrong, contact your administrator.",
	},
	rateLimited: {
		heading: "Too many requests",
		description: "Slow down and try again in a moment.",
	},
	fileTooLarge: {
		heading: "File too large",
		description: "The file you tried to upload exceeds the allowed size.",
	},
	unexpected: {
		heading: "Something went wrong",
		description: "An unexpected error occurred. Please try again.",
	},
};

function resolveMessages(overrides?: FallbackMessages): Required<FallbackMessages> {
	if (!overrides) {
		return DEFAULT_MESSAGES;
	}
	return {
		networkError: overrides.networkError ?? DEFAULT_MESSAGES.networkError,
		sessionExpired: overrides.sessionExpired ?? DEFAULT_MESSAGES.sessionExpired,
		forbidden: overrides.forbidden ?? DEFAULT_MESSAGES.forbidden,
		rateLimited: overrides.rateLimited ?? DEFAULT_MESSAGES.rateLimited,
		fileTooLarge: overrides.fileTooLarge ?? DEFAULT_MESSAGES.fileTooLarge,
		unexpected: overrides.unexpected ?? DEFAULT_MESSAGES.unexpected,
	};
}

interface ParsedEnvelope {
	banner?: BannerPayload;
}

const VALID_TONES = new Set<string>(["info", "success", "warning", "critical", "auto"]);

function isBannerPayload(value: unknown): value is BannerPayload {
	if (!value || typeof value !== "object") {
		return false;
	}
	const candidate = value as Record<string, unknown>;
	if (typeof candidate.heading !== "string") {
		return false;
	}
	if (typeof candidate.tone !== "string" || !VALID_TONES.has(candidate.tone)) {
		return false;
	}
	if (candidate.description !== undefined && typeof candidate.description !== "string") {
		return false;
	}
	return true;
}

function parseResponseEnvelope(error: HttpResponseError): ParsedEnvelope | null {
	const raw = error.response.data;
	let data: unknown;
	if (typeof raw === "string") {
		try {
			data = JSON.parse(raw);
		} catch {
			return null;
		}
	} else if (raw && typeof raw === "object") {
		data = raw;
	} else {
		return null;
	}
	if (!data || typeof data !== "object") {
		return null;
	}
	// `withFlash()` macro wraps the envelope under a top-level `notice` key
	// so XHR responses can co-exist with arbitrary payload data. Read it
	// back from there — not from the root.
	const notice = (data as { notice?: unknown }).notice;
	if (!notice || typeof notice !== "object") {
		return null;
	}
	const envelope = notice as { banner?: unknown };
	if (envelope.banner === undefined) {
		return {} as ParsedEnvelope;
	}
	if (!isBannerPayload(envelope.banner)) {
		return null;
	}
	const banner = sanitizeBannerActions(envelope.banner);
	return { banner } satisfies ParsedEnvelope;
}

/**
 * Drop any link-style banner actions whose URL fails the same-origin URL guard.
 * Inline-onClick variants can't reach this code path (PHP cannot emit closures),
 * so they're left untouched.
 */
function sanitizeBannerActions(banner: BannerPayload): BannerPayload {
	if (!banner.actions || banner.actions.length === 0) {
		return banner;
	}
	const origin = typeof window !== "undefined" ? window.location.origin : undefined;
	const safe = banner.actions.filter((action: BannerAction): boolean => {
		if (!("url" in action)) {
			return true;
		}
		return isSafeUrl(action.url, origin);
	});
	if (safe.length === banner.actions.length) {
		return banner;
	}
	return { ...banner, actions: safe };
}

function fallbackBannerForStatus(
	status: number,
	messages: Required<FallbackMessages>,
): BannerPayload {
	if (status === 403) {
		return { ...messages.forbidden, tone: "critical", dismissible: true };
	}
	if (status === 413) {
		return { ...messages.fileTooLarge, tone: "warning", dismissible: true };
	}
	if (status === 429) {
		return { ...messages.rateLimited, tone: "warning", dismissible: true };
	}
	return { ...messages.unexpected, tone: "critical", dismissible: true };
}

export interface HttpErrorInterceptorProps {
	/**
	 * Override any subset of fallback strings used when a failure has no
	 * envelope. Not needed when the package's English defaults are fine.
	 */
	fallbackMessages?: FallbackMessages;
}

/**
 * Module-level guard against re-entrant 401/419 reloads. Set to `true` while a
 * `router.reload()` is in flight so subsequent 401s skip the reload (the
 * notices banner-id dedupe still suppresses the visible duplicate banner).
 */
let isReloading = false;

/**
 * Internal: reset the reload guard. Exposed for tests that simulate sequential
 * 401 scenarios across test boundaries; not part of the public API.
 *
 * @internal
 */
export function __resetSessionReloadGuard(): void {
	isReloading = false;
}

const SESSION_EXPIRED_BANNER_ID = "shopify-flash:session-expired";

/**
 * Mount once near the root of the app, inside `<NoticesProvider />` and the
 * App Bridge provider. Returns `null`.
 */
export function HttpErrorInterceptor({ fallbackMessages }: HttpErrorInterceptorProps = {}) {
	const { add } = useNoticesContext();
	const shopify = asShopifyApi(useAppBridge());

	// Use refs so the effect that subscribes to `http.onError` doesn't tear
	// down and re-subscribe on every render — but still reads the latest
	// values when an error fires.
	const addRef = useRef(add);
	addRef.current = add;
	const shopifyRef = useRef(shopify);
	shopifyRef.current = shopify;
	const messagesRef = useRef(resolveMessages(fallbackMessages));
	messagesRef.current = resolveMessages(fallbackMessages);

	useEffect(() => {
		return http.onError((error) => {
			if (error instanceof HttpCancelledError) {
				return;
			}

			if (error instanceof HttpNetworkError) {
				showToast(
					{ message: messagesRef.current.networkError, isError: true },
					{},
					shopifyRef.current,
				);
				return;
			}

			if (!(error instanceof HttpResponseError)) {
				return;
			}

			const status = error.response.status;

			// Inertia v3 owns 422 form errors — leave them alone.
			if (status === 422) {
				return;
			}

			if (status === 401 || status === 419) {
				const { heading, description } = messagesRef.current.sessionExpired;
				// Stable id so re-fired 401s replace the existing banner in
				// place (NoticesProvider dedupes by id) instead of stacking.
				addRef.current({
					id: SESSION_EXPIRED_BANNER_ID,
					heading,
					description,
					tone: "critical",
					dismissible: false,
				});
				if (!isReloading) {
					isReloading = true;
					const finishCleanup = router.on("finish", () => {
						isReloading = false;
						finishCleanup();
					});
					// Defer one frame so the banner paints before the reload swaps the page.
					requestAnimationFrame(() => {
						router.reload();
					});
				}
				return;
			}

			const envelope = parseResponseEnvelope(error);
			if (envelope?.banner) {
				addRef.current(envelope.banner);
				return;
			}

			addRef.current(fallbackBannerForStatus(status, messagesRef.current));
		});
	}, []);

	return null;
}
