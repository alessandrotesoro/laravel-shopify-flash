import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	__resetFlashHandlerRegistry,
	getHandler,
	useFlashHandlers,
} from "../../js/hooks/useFlashHandlers";

afterEach(() => {
	__resetFlashHandlerRegistry();
});

describe("useFlashHandlers", () => {
	it("registers a handler that becomes resolvable via getHandler", () => {
		const { result } = renderHook(() => useFlashHandlers());
		const fn = vi.fn();

		act(() => {
			result.current.register("product.delete", fn);
		});

		expect(getHandler("product.delete")).toBe(fn);
	});

	it("returned cleanup unregisters the handler (lifetime scoping)", () => {
		const { result } = renderHook(() => useFlashHandlers());
		const fn = vi.fn();

		let cleanup!: () => void;
		act(() => {
			cleanup = result.current.register("product.delete", fn);
		});
		expect(getHandler("product.delete")).toBe(fn);

		act(() => {
			cleanup();
		});
		expect(getHandler("product.delete")).toBeUndefined();
	});

	it("unregister(name) removes the handler", () => {
		const { result } = renderHook(() => useFlashHandlers());
		const fn = vi.fn();

		act(() => {
			result.current.register("x", fn);
			result.current.unregister("x");
		});
		expect(getHandler("x")).toBeUndefined();
	});

	it("returned register/unregister are stable across re-renders", () => {
		const { result, rerender } = renderHook(() => useFlashHandlers());
		const first = result.current;
		rerender();
		const second = result.current;

		expect(second.register).toBe(first.register);
		expect(second.unregister).toBe(first.unregister);
	});

	it("a stale cleanup does not delete a handler re-registered by another caller", () => {
		const { result } = renderHook(() => useFlashHandlers());
		const fn1 = vi.fn();
		const fn2 = vi.fn();

		let cleanup1!: () => void;
		act(() => {
			cleanup1 = result.current.register("x", fn1);
		});
		// Another caller overwrites the registration with a different fn.
		act(() => {
			result.current.register("x", fn2);
		});
		// The stale cleanup from the first registration must be a no-op.
		act(() => {
			cleanup1();
		});

		expect(getHandler("x")).toBe(fn2);
	});
});
