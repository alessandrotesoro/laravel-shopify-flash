// Client-side toast hook.
//
// The toast sibling of `useNotices()` (which owns client banners). Wraps the
// internal toast bridge so consumer code never calls `shopify.toast.show()`
// directly — the bridge stays the single App Bridge toast chokepoint.
//
// For server-declared toasts, prefer backend flash (`withToast` / `withFlash`)
// rendered by `<FlashListener />` / `<FlashHttpInterceptor />`. Reach for this
// hook only when the success is genuinely client-owned (e.g. an upload batch
// completing, a download starting) with no server response to flash from.

import { useAppBridge } from "@shopify/app-bridge-react";
import { useCallback } from "react";
import { asShopifyApi, hideToast, showToast } from "../bridge/toast-bridge";
import type { ToastPayload } from "../types";

export interface UseToastReturn {
	/** Show a fully-specified toast payload. Returns the bridge toast id. */
	show: (payload: ToastPayload) => string;
	/** Show a plain success toast. Returns the bridge toast id. */
	success: (message: string) => string;
	/** Show an error-styled toast. Returns the bridge toast id. */
	error: (message: string) => string;
	/** Hide a previously-shown toast by id. */
	hide: (id: string) => void;
}

/**
 * Hook exposing the App Bridge toast surface through the package bridge.
 *
 * Must be called inside the App Bridge provider (so `useAppBridge()` resolves).
 */
export function useToast(): UseToastReturn {
	const shopify = asShopifyApi(useAppBridge());

	const show = useCallback(
		(payload: ToastPayload): string => showToast(payload, {}, shopify),
		[shopify],
	);
	const success = useCallback(
		(message: string): string => showToast({ message }, {}, shopify),
		[shopify],
	);
	const error = useCallback(
		(message: string): string => showToast({ message, isError: true }, {}, shopify),
		[shopify],
	);
	const hide = useCallback((id: string): void => hideToast(id, shopify), [shopify]);

	return { show, success, error, hide };
}
