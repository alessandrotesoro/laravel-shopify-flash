// Thin wrapper around App Bridge's `shopify.toast.show()` / `shopify.toast.hide()`.
//
// This is the only file in the package that calls the App Bridge toast surface.
// The `shopifyApi` argument is what `useAppBridge()` returns — passing it in
// (rather than reading the global) keeps this file SSR-safe and unit-testable.

import type { ToastPayload } from "../types";

/**
 * Minimal subset of `ShopifyGlobal.toast` that the bridge relies on. Mirrors
 * the published `ToastApi` surface from `@shopify/app-bridge-types` without
 * pulling the dependency in directly so this module can be tested with a plain
 * spy object.
 */
export interface ToastApiLike {
	show: (
		message: string,
		opts?: {
			duration?: number;
			isError?: boolean;
			action?: string;
			onAction?: () => void;
			onDismiss?: () => void;
		},
	) => string;
	hide: (id: string) => void;
}

/**
 * Subset of `useAppBridge()`'s return type that the bridge needs.
 */
export interface ShopifyApiLike {
	toast: ToastApiLike;
}

/**
 * Optional callbacks the listener wires onto a toast.
 */
export interface ToastBridgeOptions {
	onAction?: () => void;
	onDismiss?: () => void;
}

/**
 * Show a toast through App Bridge. Returns the toast id so callers can
 * imperatively hide it later via {@link hideToast}.
 */
export function showToast(
	payload: ToastPayload,
	options: ToastBridgeOptions,
	shopifyApi: ShopifyApiLike,
): string {
	const opts: Parameters<ToastApiLike["show"]>[1] = {};

	if (payload.duration !== undefined) {
		opts.duration = payload.duration;
	}
	if (payload.isError !== undefined) {
		opts.isError = payload.isError;
	}
	if (payload.action !== undefined && options.onAction !== undefined) {
		opts.action = payload.action.label;
		opts.onAction = options.onAction;
	}
	if (options.onDismiss !== undefined) {
		opts.onDismiss = options.onDismiss;
	}

	return shopifyApi.toast.show(payload.message, opts);
}

/**
 * Hide a previously-shown toast by id.
 */
export function hideToast(id: string, shopifyApi: ShopifyApiLike): void {
	shopifyApi.toast.hide(id);
}
