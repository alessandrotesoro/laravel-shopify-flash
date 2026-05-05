// Single global listener for Inertia's `flash` event.
//
// Mount once, in the consumer's app shell. On every flash:
//
//   - `flash.toast` → show via the App Bridge toast bridge.
//   - `flash.banner` → forward to the `onBanner` callback (the consumer wires
//     this to the notices stack).
//
// Named action handlers (`{ handler: 'name', params: {...} }`) are resolved
// against the `useFlashHandlers()` registry. If the handler isn't registered
// when the flash arrives, the listener buffers the resolution for one
// microtask — protecting against a first-paint race where the page that
// registers the handler mounts in the same React commit as the flash event
// fires. After the microtask drains: if the handler is still missing, the
// listener falls back to "log warning + omit action button" so the toast still
// renders but cannot silently no-op.

import { router } from "@inertiajs/react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useRef } from "react";
import { asShopifyApi, hideToast, type ShopifyApiLike, showToast } from "../bridge/toast-bridge";
import { type FlashHandler, getHandler, onHandlerRegistered } from "../hooks/useFlashHandlers";
import { isSafeUrl } from "../security/url-guard";
import type { BannerPayload, FlashEnvelope, ToastAction, ToastPayload } from "../types";

export interface FlashListenerProps {
	/**
	 * Called when a flash carries a banner payload. Consumers wire this to
	 * `useNotices().add`. Optional so tests and toast-only consumers can mount
	 * the listener without it.
	 */
	onBanner?: (banner: BannerPayload) => void;
}

interface ResolvedHandlerAction {
	kind: "handler";
	label: string;
	fn: FlashHandler;
	params: Record<string, unknown>;
}

interface UnresolvedHandlerAction {
	kind: "unresolved";
	label: string;
	name: string;
}

type ResolvedAction = ResolvedHandlerAction | UnresolvedHandlerAction | undefined;

/**
 * Resolve the action attached to a toast payload into either a callable
 * handler or an unresolved marker (so the bridge can omit the button and we
 * can log a warning). Awaits one microtask of buffering for handlers that
 * arrive in the same React commit as the flash event.
 *
 * Link-style actions (`{ label, url }`) are not handled here — the listener
 * resolves those via `router.visit` directly.
 */
async function resolveHandlerAction(action: ToastAction): Promise<ResolvedAction> {
	if (!("handler" in action)) {
		return undefined;
	}
	const name = action.handler;
	const params = action.params ?? {};
	const immediate = getHandler(name);
	if (immediate) {
		return { kind: "handler", label: action.label, fn: immediate, params };
	}
	// Buffer for one microtask — see file header.
	const arrived = await new Promise<boolean>((resolve) => {
		const unsubscribe = onHandlerRegistered(name, () => {
			unsubscribe();
			resolve(true);
		});
		Promise.resolve().then(() => {
			unsubscribe();
			resolve(false);
		});
	});
	if (arrived) {
		const fn = getHandler(name);
		if (fn) {
			return { kind: "handler", label: action.label, fn, params };
		}
	}
	return { kind: "unresolved", label: action.label, name };
}

async function dispatchToast(
	payload: ToastPayload,
	shopifyApi: ShopifyApiLike,
	mountedRef: { current: boolean },
): Promise<void> {
	const action = payload.action;

	// No action — fire-and-forget. Toast auto-dismisses per its duration.
	if (!action) {
		showToast(payload, {}, shopifyApi);
		return;
	}

	// Link-style action — wrap onAction to call router.visit(url).
	if ("url" in action) {
		const url = action.url;
		const origin = typeof window !== "undefined" ? window.location.origin : undefined;
		if (!isSafeUrl(url, origin)) {
			console.warn(
				`[shopify-flash] Toast link action URL rejected by url-guard: "${url}". Action will be omitted.`,
			);
			const { action: _omitted, ...rest } = payload;
			void _omitted;
			showToast(rest, {}, shopifyApi);
			return;
		}
		showToast(
			payload,
			{
				onAction: () => {
					router.visit(url);
				},
			},
			shopifyApi,
		);
		return;
	}

	// Named-handler action — resolve against the registry (with one-tick
	// buffering for first-paint races).
	const resolved = await resolveHandlerAction(action);

	if (!mountedRef.current) {
		return;
	}

	if (!resolved || resolved.kind === "unresolved") {
		const name = resolved?.name ?? action.handler;
		console.warn(
			`[shopify-flash] No handler registered for "${name}". Toast action will be omitted.`,
		);
		// Show the toast WITHOUT the action button so it can't silently no-op.
		const { action: _omitted, ...rest } = payload;
		void _omitted;
		showToast(rest, {}, shopifyApi);
		return;
	}

	let toastId: string | undefined;
	const onAction = (): void => {
		let result: void | Promise<void>;
		try {
			result = resolved.fn(resolved.params);
		} catch (error) {
			console.error(`[shopify-flash] Handler "${action.handler}" threw:`, error);
			return;
		}

		if (result && typeof (result as Promise<void>).then === "function") {
			(result as Promise<void>).then(
				() => {
					if (!mountedRef.current) {
						return;
					}
					if (toastId !== undefined) {
						hideToast(toastId, shopifyApi);
					}
				},
				(error) => {
					console.error(`[shopify-flash] Handler "${action.handler}" rejected:`, error);
				},
			);
			return;
		}

		// Sync handler — auto-dismiss immediately.
		if (toastId !== undefined) {
			hideToast(toastId, shopifyApi);
		}
	};

	toastId = showToast(payload, { onAction }, shopifyApi);
}

/**
 * The listener.
 *
 * Mount once near the root of the app (inside `<AppBridgeProvider>` so
 * `useAppBridge()` resolves). Subscribes to `router.on('flash', ...)` and
 * dispatches each event. The cleanup returned by `router.on` is the effect
 * cleanup, so unmount removes the subscription cleanly.
 */
export function FlashListener({ onBanner }: FlashListenerProps): null {
	const shopify = asShopifyApi(useAppBridge());

	// Stable ref to the latest onBanner so swapping inline callbacks doesn't
	// re-subscribe the flash listener on every parent render.
	const onBannerRef = useRef(onBanner);
	onBannerRef.current = onBanner;

	// Track mount status so async toast paths don't fire bridge calls after
	// unmount (e.g. handler-resolution microtask resolves post-cleanup).
	const mountedRef = useRef(true);

	useEffect(() => {
		mountedRef.current = true;
		const cleanup = router.on("flash", (event) => {
			const flash = event.detail.flash as FlashEnvelope | undefined;
			if (!flash) {
				return;
			}
			if (flash.toast) {
				// Fire-and-forget — the dispatcher awaits the handler-resolution
				// microtask internally; we don't want to block the event handler.
				void dispatchToast(flash.toast, shopify, mountedRef);
			}
			if (flash.banner && onBannerRef.current) {
				onBannerRef.current(flash.banner);
			}
		});
		return () => {
			mountedRef.current = false;
			cleanup();
		};
	}, [shopify]);

	return null;
}
