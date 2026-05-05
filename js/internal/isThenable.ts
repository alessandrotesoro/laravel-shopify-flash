/**
 * Duck-typed thenable check. We accept any `{ then: function }` rather than
 * `instanceof Promise` so user callbacks returning custom thenables (e.g. from
 * a non-native Promise polyfill) round-trip correctly.
 *
 * @internal
 */
export function isThenable(value: unknown): value is PromiseLike<unknown> {
	return (
		value !== null &&
		typeof value === "object" &&
		typeof (value as PromiseLike<unknown>).then === "function"
	);
}
