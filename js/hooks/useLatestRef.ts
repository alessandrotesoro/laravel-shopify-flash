import { type RefObject, useRef } from "react";

/**
 * Keep a ref pointing at the latest value of a prop or context binding so an
 * effect with an empty dep array can read the freshest value without
 * re-subscribing every render.
 *
 * @internal — not exported from the package entry.
 */
export function useLatestRef<T>(value: T): RefObject<T> {
	const ref = useRef(value);
	ref.current = value;
	return ref;
}
