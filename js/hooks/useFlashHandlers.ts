// Lifetime-scoped registry of named flash action handlers.
//
// `useFlashHandlers()` returns `{ register, unregister }`. The internal
// registry is a module-level singleton so that <FlashListener /> (mounted in
// the app shell) and consumer components (which call `register` from page-
// level effects) share the same map without prop drilling.
//
// "Lifetime-scoped" = each `register(name, fn)` returns an unregister callback
// suitable for use as a `useEffect` cleanup. When a component unmounts and
// its effect cleans up, the handler disappears from the registry, so handlers
// from prior pages are not silently resolvable on later flashes.

import { useMemo } from "react";

/**
 * A flash action handler. Receives the action's `params` (no closure capture
 * of caller state — keeps cross-tenant safety as an architectural property,
 * not a runtime check). May return a Promise; if it does, the listener treats
 * the toast as pending until resolution.
 */
export type FlashHandler = (params: Record<string, unknown>) => void | Promise<void>;

const registry = new Map<string, FlashHandler>();
const waiters = new Map<string, Set<() => void>>();

/**
 * Internal: look up a handler by name. Returns undefined if not registered.
 * Exposed for the listener; not part of the public API.
 */
export function getHandler(name: string): FlashHandler | undefined {
	return registry.get(name);
}

/**
 * Internal: subscribe to a one-shot notification when a handler with the given
 * name is registered. Returns an unsubscribe callback. The listener uses this
 * for the pre-registration buffering window (one microtask).
 *
 * Exposed for the listener; not part of the public API.
 */
export function onHandlerRegistered(name: string, fn: () => void): () => void {
	let bucket = waiters.get(name);
	if (!bucket) {
		bucket = new Set();
		waiters.set(name, bucket);
	}
	bucket.add(fn);
	return () => {
		const current = waiters.get(name);
		if (!current) {
			return;
		}
		current.delete(fn);
		if (current.size === 0) {
			waiters.delete(name);
		}
	};
}

/**
 * Test-only: clear the global registry between tests so they don't leak.
 * Not exported from `js/index.ts`.
 */
export function __resetFlashHandlerRegistry(): void {
	registry.clear();
	waiters.clear();
}

function registerHandler(name: string, fn: FlashHandler): () => void {
	registry.set(name, fn);
	const bucket = waiters.get(name);
	if (bucket) {
		// Drain waiters in registration order; each waiter unsubscribes itself.
		for (const waiter of Array.from(bucket)) {
			waiter();
		}
	}
	return () => {
		// Only delete if still pointing at the same fn — protects against a
		// later overwrite then a stale unregister.
		if (registry.get(name) === fn) {
			registry.delete(name);
		}
	};
}

function unregisterHandler(name: string): void {
	registry.delete(name);
}

/**
 * Hook returning a stable `{ register, unregister }` API. The returned
 * functions are referentially stable across re-renders, so they can be used
 * as `useEffect` deps without triggering re-subscription loops.
 */
export function useFlashHandlers(): {
	register: (name: string, fn: FlashHandler) => () => void;
	unregister: (name: string) => void;
} {
	return useMemo(
		() => ({
			register: registerHandler,
			unregister: unregisterHandler,
		}),
		[],
	);
}
