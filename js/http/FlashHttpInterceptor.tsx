// Unified XHR flash interceptor.
//
// Subscribes to Inertia v3's `http.onResponse(...)` (success) and
// `http.onError(...)` (failure) and routes each into the toast bridge / notices
// context. Inertia visits render flash via `<FlashListener />` (router.on
// 'flash'); standalone `useHttp` requests render it here. `onResponse` fires for
// every 2xx (Inertia page visits included), but the success path only acts on a
// top-level `notice` key — written solely by `JsonResponse::withFlash`. Inertia
// page responses carry flash inside the page object (props.flash), so this
// handler is a no-op for them and a given flash payload renders exactly once.
//
// Success (2xx) — read the `notice` envelope merged by `JsonResponse::withFlash`:
//   - `notice.toast`  → show via the App Bridge toast bridge.
//   - `notice.banner` → forward to the notices context.
//   Toast actions are intentionally not wired on this path (no per-toast action
//   handler is available here); emit action toasts via Inertia flash instead.
//
// Failure routing (unchanged):
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
import { useEffect, useMemo } from "react";
import { asShopifyApi, showToast } from "../bridge/toast-bridge";
import { useNoticesContext } from "../components/NoticesProvider";
import { useLatestRef } from "../hooks/useLatestRef";
import { isSafeUrl } from "../security/url-guard";
import type { BannerAction, BannerPayload, ToastPayload, Tone } from "../types";

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

export const DEFAULT_MESSAGES: Required<FallbackMessages> = {
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
	return { ...DEFAULT_MESSAGES, ...overrides };
}

const VALID_TONES: ReadonlySet<string> = new Set([
	"info",
	"success",
	"warning",
	"critical",
	"auto",
] as const satisfies readonly Tone[]);

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
	if (candidate.actions !== undefined && !Array.isArray(candidate.actions)) {
		return false;
	}
	return true;
}

/**
 * Narrow an arbitrary value into a {@link ToastPayload}. Requires a non-empty
 * string `message` (matching the PHP-side construction guard). `action` is not
 * carried — the XHR-success path has no per-toast action handler.
 */
function toToastPayload(value: unknown): ToastPayload | undefined {
	if (!value || typeof value !== "object") {
		return undefined;
	}
	const candidate = value as Record<string, unknown>;
	if (typeof candidate.message !== "string" || candidate.message.trim() === "") {
		return undefined;
	}
	const out: ToastPayload = { message: candidate.message };
	if (typeof candidate.isError === "boolean") {
		out.isError = candidate.isError;
	}
	if (typeof candidate.duration === "number" && Number.isFinite(candidate.duration)) {
		out.duration = candidate.duration;
	}
	return out;
}

/**
 * Parse the response body (string or object) and return its `notice` object, or
 * `null` when the body is unparseable or carries no `notice` key. Both the
 * success and error paths read the envelope from the same `notice` key written
 * by `withFlash()`.
 */
function extractNotice(raw: unknown): Record<string, unknown> | null {
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
	const notice = (data as { notice?: unknown }).notice;
	if (!notice || typeof notice !== "object") {
		return null;
	}
	return notice as Record<string, unknown>;
}

/**
 * Read toast + banner from a response body — used by both the success and error
 * paths. Either field is absent when missing or invalid; the success path reads
 * both, the error path reads only `banner` (and falls back to a status banner
 * when it's absent). Never throws on a malformed body.
 */
function parseFlashNotice(raw: unknown): { toast?: ToastPayload; banner?: BannerPayload } {
	const notice = extractNotice(raw);
	if (notice === null) {
		return {};
	}
	const out: { toast?: ToastPayload; banner?: BannerPayload } = {};
	const toast = toToastPayload(notice.toast);
	if (toast) {
		out.toast = toast;
	}
	if (notice.banner !== undefined && isBannerPayload(notice.banner)) {
		out.banner = sanitizeBannerActions(notice.banner);
	}
	return out;
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
		// A malformed (non-string) url is treated as unsafe and dropped, rather
		// than thrown — isSafeUrl assumes a string.
		return typeof action.url === "string" && isSafeUrl(action.url, origin);
	});
	if (safe.length === banner.actions.length) {
		return banner;
	}
	return { ...banner, actions: safe };
}

type BannerMessageKey = Exclude<
	keyof Required<FallbackMessages>,
	"networkError" | "sessionExpired"
>;

export interface FallbackEntry {
	messageKey: BannerMessageKey;
	tone: Tone;
	dismissible: boolean;
}

/**
 * Status → fallback-banner mapping for no-envelope responses. 401/419 and 422
 * are routed separately in the interceptor and intentionally absent. Statuses
 * not listed fall through to the `unexpected` entry.
 */
export const FALLBACK_BY_STATUS: Record<number, FallbackEntry> = {
	403: { messageKey: "forbidden", tone: "critical", dismissible: true },
	413: { messageKey: "fileTooLarge", tone: "warning", dismissible: true },
	429: { messageKey: "rateLimited", tone: "warning", dismissible: true },
};

const UNEXPECTED_FALLBACK: FallbackEntry = {
	messageKey: "unexpected",
	tone: "critical",
	dismissible: true,
};

function fallbackBannerForStatus(
	status: number,
	messages: Required<FallbackMessages>,
): BannerPayload {
	const entry = FALLBACK_BY_STATUS[status] ?? UNEXPECTED_FALLBACK;
	return { ...messages[entry.messageKey], tone: entry.tone, dismissible: entry.dismissible };
}

export interface FlashHttpInterceptorProps {
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
export function FlashHttpInterceptor({ fallbackMessages }: FlashHttpInterceptorProps = {}) {
	const { add } = useNoticesContext();
	const shopify = asShopifyApi(useAppBridge());
	const messages = useMemo(() => resolveMessages(fallbackMessages), [fallbackMessages]);

	// Refs keep the `http.on*` subscriptions stable across renders while still
	// reading the latest values when an event fires.
	const addRef = useLatestRef(add);
	const shopifyRef = useLatestRef(shopify);
	const messagesRef = useLatestRef(messages);

	// Success path — drain the flash envelope from 2xx responses. The body is
	// wrapped: a throw here would reject an otherwise-successful request (Inertia
	// re-throws non-HttpError failures from the response chain), turning a 200
	// into a caller-visible failure. Flash rendering must never do that.
	useEffect(() => {
		return http.onResponse((response) => {
			try {
				const { toast, banner } = parseFlashNotice(response.data);
				if (toast) {
					showToast(toast, {}, shopifyRef.current);
				}
				if (banner) {
					addRef.current(banner);
				}
			} catch (err) {
				console.error("[shopify-flash] success flash handler failed:", err);
			}
			return response;
		});
	}, []);

	// Error path.
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

			const { banner } = parseFlashNotice(error.response.data);
			if (banner) {
				addRef.current(banner);
				return;
			}

			addRef.current(fallbackBannerForStatus(status, messagesRef.current));
		});
	}, []);

	return null;
}
