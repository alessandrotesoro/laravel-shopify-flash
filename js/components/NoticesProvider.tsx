// Notices context + provider.
//
// Holds the array of active banner notices and exposes the operations the
// rest of the package (and consumer code) needs to mutate it. Notices are
// keyed by a client-generated id so the same `BannerPayload` shape can flow
// in from any source — backend flash, HTTP error interceptor, or programmatic
// `useNotices().add(...)` calls — and still be addressable for removal.
//
// Provider placement: mount once near the root of the app, inside the App
// Bridge provider. `<NoticesContainer />` is the rendering surface and may be
// placed anywhere underneath.

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import type { BannerPayload, Tone } from "../types";

/**
 * The id is opaque — callers should treat it only as an argument to `remove(id)`.
 */
export interface Notice extends BannerPayload {
	id: string;
}

interface NoticesContextValue {
	items: Notice[];
	add: (payload: BannerPayload) => string;
	remove: (id: string) => void;
	removeByTone: (tone: Tone) => void;
	clear: () => void;
}

const NoticesContext = createContext<NoticesContextValue | null>(null);

function generateId(): string {
	// `crypto.randomUUID()` is available in all modern browsers and in the
	// happy-dom test environment. No fallback needed for the supported runtimes.
	return crypto.randomUUID();
}

export interface NoticesProviderProps {
	children: ReactNode;
}

/**
 * Provides notices state to descendants. Wrap the part of the React tree that
 * needs to read or mutate the notices stack.
 */
export function NoticesProvider({ children }: NoticesProviderProps) {
	const [items, setItems] = useState<Notice[]>([]);

	const add = useCallback((payload: BannerPayload): string => {
		const id = payload.id ?? generateId();
		setItems((prev) => {
			const existingIndex = prev.findIndex((notice) => notice.id === id);
			if (existingIndex >= 0) {
				const next = [...prev];
				next[existingIndex] = { ...payload, id };
				return next;
			}
			return [...prev, { ...payload, id }];
		});
		return id;
	}, []);

	const remove = useCallback((id: string): void => {
		setItems((prev) => prev.filter((notice) => notice.id !== id));
	}, []);

	const removeByTone = useCallback((tone: Tone): void => {
		setItems((prev) => prev.filter((notice) => notice.tone !== tone));
	}, []);

	const clear = useCallback((): void => {
		setItems((prev) => (prev.length === 0 ? prev : []));
	}, []);

	const value = useMemo<NoticesContextValue>(
		() => ({ items, add, remove, removeByTone, clear }),
		[items, add, remove, removeByTone, clear],
	);

	return <NoticesContext.Provider value={value}>{children}</NoticesContext.Provider>;
}

/**
 * Internal: read the raw notices context. Throws when used outside a provider.
 * Exposed for `useNotices()` and `<NoticesContainer />`; not part of the
 * public API.
 */
export function useNoticesContext(): NoticesContextValue {
	const context = useContext(NoticesContext);
	if (!context) {
		throw new Error("useNotices must be used within a <NoticesProvider />");
	}
	return context;
}
