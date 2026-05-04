// Public hook for adding, removing, and reading notices.
//
// Returns the raw `add(payload)`, `remove(id)`, `clear()`, and `items` from
// the provider, plus convenience methods that prefill the `tone` field for
// the four common cases. The convenience methods accept an `Omit<BannerPayload, "tone">`
// so callers can stay type-safe without restating `tone` at every call site.

import { useCallback } from "react";
import { type Notice, useNoticesContext } from "../components/NoticesProvider";
import type { BannerPayload, Tone } from "../types";

type ToneOmitted = Omit<BannerPayload, "tone">;

export interface UseNoticesReturn {
	items: Notice[];
	add: (payload: BannerPayload) => string;
	remove: (id: string) => void;
	removeByTone: (tone: Tone) => void;
	clear: () => void;
	info: (payload: ToneOmitted) => string;
	success: (payload: ToneOmitted) => string;
	warning: (payload: ToneOmitted) => string;
	critical: (payload: ToneOmitted) => string;
}

/**
 * Hook for reading and mutating the notices stack.
 *
 * Throws when called outside a `<NoticesProvider />`.
 */
export function useNotices(): UseNoticesReturn {
	const { items, add, remove, removeByTone, clear } = useNoticesContext();

	const info = useCallback(
		(payload: ToneOmitted): string => add({ ...payload, tone: "info" }),
		[add],
	);
	const success = useCallback(
		(payload: ToneOmitted): string => add({ ...payload, tone: "success" }),
		[add],
	);
	const warning = useCallback(
		(payload: ToneOmitted): string => add({ ...payload, tone: "warning" }),
		[add],
	);
	const critical = useCallback(
		(payload: ToneOmitted): string => add({ ...payload, tone: "critical" }),
		[add],
	);

	return { items, add, remove, removeByTone, clear, info, success, warning, critical };
}

export type { Notice };
