// Type declarations for @sematico/shopify-flash.
//
// This module mirrors the PHP wire shapes defined in `src/Payloads/*` and
// `src/Http/FlashEnvelope.php`. Field names and optionality are kept verbatim
// with the PHP value objects so the JSON envelope round-trips without any
// runtime translation layer.
//
// Consumers opt into the Inertia v3 `usePage().flash` typing by importing
// this module from a `.d.ts` they own (typically `resources/js/types/shopify-flash.d.ts`):
//
//   import "@sematico/shopify-flash/types";
//
// That import triggers the declaration merging at the bottom of this file and
// makes `usePage().flash.toast` / `.banner` fully typed without code generation.

/**
 * Banner tone — matches `Sematico\ShopifyFlash\Payloads\Tone`.
 */
export type Tone = "info" | "success" | "warning" | "critical" | "auto";

/**
 * Action attached to a toast — matches `Sematico\ShopifyFlash\Payloads\ToastAction`.
 *
 * Discriminated union:
 * - link form: `{ label, url }` — host wraps `onAction` to call `router.visit(url)`.
 * - named-handler form: `{ label, handler, params? }` — `handler` is the string name of
 *   a client-side function registered via `useFlashHandlers()` (lands in U5).
 */
export type ToastAction =
	| { label: string; url: string }
	| { label: string; handler: string; params?: Record<string, unknown> };

/**
 * Action attached to a banner — matches `Sematico\ShopifyFlash\Payloads\BannerAction`.
 *
 * Structurally identical to {@link ToastAction}; PHP-side validation differs
 * (banner link URLs are origin-checked at construction time).
 */
export type BannerAction = ToastAction;

/**
 * Toast payload — matches `Sematico\ShopifyFlash\Payloads\ToastPayload`.
 */
export interface ToastPayload {
	message: string;
	isError?: boolean;
	duration?: number;
	action?: ToastAction;
}

/**
 * Banner payload — matches `Sematico\ShopifyFlash\Payloads\BannerPayload`.
 *
 * `actions` is bounded to a maximum of two on the PHP side (App Bridge banner
 * surface only renders two slots). The bound is enforced at construction in PHP
 * and is not expressible in the TS shape.
 */
export interface BannerPayload {
	heading: string;
	tone: Tone;
	description?: string;
	dismissible?: boolean;
	actions?: BannerAction[];
}

/**
 * Flash envelope — matches `Sematico\ShopifyFlash\Http\FlashEnvelope`.
 *
 * Both keys are optional in the wire shape; PHP requires at least one to be
 * present at construction time, but consumers reading `usePage().flash` should
 * still treat both as potentially undefined.
 */
export interface FlashEnvelope {
	toast?: ToastPayload;
	banner?: BannerPayload;
}

// Augment @inertiajs/core's `InertiaConfig` via declaration merging so that
// `usePage().flash` resolves to `FlashEnvelope` without consumers needing to
// thread a generic through every call site.
//
// We target `@inertiajs/core` (not `@inertiajs/react`) because `InertiaConfig`
// is declared there and `@inertiajs/react`'s `usePage()` resolves `flash` via
// `Page['flash']` → `FlashData` → `InertiaConfigFor<'flashDataType'>` from core.
declare module "@inertiajs/core" {
	interface InertiaConfig {
		flashDataType: FlashEnvelope;
	}
}
