// Public entry for @sematico/shopify-flash.
//
// Type re-exports land here in U4. Runtime exports (FlashListener + bridge +
// handlers in U5, notices stack + HTTP error interceptor in U6) are added
// to this file as those units land.

export type { FlashListenerProps } from "./components/FlashListener";
export { FlashListener } from "./components/FlashListener";
export type { FlashHandler } from "./hooks/useFlashHandlers";
export { useFlashHandlers } from "./hooks/useFlashHandlers";
export type {
	BannerAction,
	BannerPayload,
	FlashEnvelope,
	ToastAction,
	ToastPayload,
	Tone,
} from "./types";
