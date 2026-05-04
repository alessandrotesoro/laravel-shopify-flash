// Transitional drain hook: pulls a `BannerPayload` shape off the Inertia
// shared `flash.notice` prop and forwards it to the notices context.
//
// This exists for consumers migrating from a "shared prop carries the
// notice" pattern to the package-native flash event listener (`<FlashListener />`).
// New code should not use this hook — emit banners through the listener via
// `back()->with(['banner' => ...])` on the backend instead.
//
// @deprecated Will be removed in v2. Migrate to `<FlashListener onBanner={...} />`.

import { usePage } from "@inertiajs/react";
import { useEffect, useRef } from "react";
import { useNoticesContext } from "../components/NoticesProvider";
import type { BannerPayload } from "../types";

interface PageWithFlashNotice {
	flash?: {
		notice?: BannerPayload | null;
	};
	[key: string]: unknown;
}

/**
 * Mount once in the app shell. Drains `usePage().props.flash.notice` into
 * the notices context exactly once per request — re-renders triggered by
 * other prop changes do not re-add the same notice.
 *
 * @deprecated Will be removed in v2. Use `<FlashListener onBanner={add} />`.
 */
export function useFlashNotice(): void {
	const { props } = usePage<PageWithFlashNotice>();
	const flashNotice = props.flash?.notice ?? null;
	const { add } = useNoticesContext();
	const lastSeen = useRef<BannerPayload | null>(null);

	useEffect(() => {
		if (!flashNotice) {
			return;
		}
		// Identity check: Inertia rebuilds the props object on each navigation,
		// so referential equality is enough to dedupe within a single request.
		if (lastSeen.current === flashNotice) {
			return;
		}
		lastSeen.current = flashNotice;
		add(flashNotice);
	}, [flashNotice, add]);
}
