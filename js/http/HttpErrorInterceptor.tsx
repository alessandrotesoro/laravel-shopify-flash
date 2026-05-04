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
import { type ShopifyApiLike, showToast } from "../bridge/toast-bridge";
import { useNoticesContext } from "../components/NoticesProvider";
import type { BannerPayload, FlashEnvelope } from "../types";

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

function parseResponseEnvelope(error: HttpResponseError): ParsedEnvelope | null {
	try {
		const data = JSON.parse(error.response.data);
		if (!data || typeof data !== "object") {
			return null;
		}
		return data as FlashEnvelope;
	} catch {
		return null;
	}
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
 * Mount once near the root of the app, inside `<NoticesProvider />` and the
 * App Bridge provider. Returns `null`.
 */
export function HttpErrorInterceptor({ fallbackMessages }: HttpErrorInterceptorProps = {}) {
	const { add } = useNoticesContext();
	const shopify = useAppBridge() as unknown as ShopifyApiLike;

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
				addRef.current({
					heading,
					description,
					tone: "critical",
					dismissible: false,
				});
				router.reload();
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
