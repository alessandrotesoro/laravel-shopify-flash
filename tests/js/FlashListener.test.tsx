import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---- Mocks --------------------------------------------------------------
//
// Mock @inertiajs/react's `router.on` so we can fire synthetic flash events
// from tests. The mock exposes a `__fireFlash` helper for triggering events
// and a `__cleanup` spy so we can assert that unmount calls the cleanup
// returned by `router.on`.

const { flashHandlers, cleanupSpy, visitSpy, toastShow, toastHide } = vi.hoisted(() => {
	return {
		flashHandlers: new Set<(event: { detail: { flash: unknown } }) => void>(),
		cleanupSpy: vi.fn(),
		visitSpy: vi.fn(),
		toastShow: vi.fn(() => "toast-id-1"),
		toastHide: vi.fn(),
	};
});

vi.mock("@inertiajs/react", () => {
	return {
		router: {
			on: (type: string, callback: (event: { detail: { flash: unknown } }) => void) => {
				if (type !== "flash") {
					return () => {};
				}
				flashHandlers.add(callback);
				return () => {
					flashHandlers.delete(callback);
					cleanupSpy();
				};
			},
			visit: visitSpy,
		},
	};
});

vi.mock("@shopify/app-bridge-react", () => {
	// Real `useAppBridge()` returns a stable singleton; mirror that here so
	// effects keyed on the handle don't re-fire across renders.
	const handle = { toast: { show: toastShow, hide: toastHide } };
	return {
		useAppBridge: () => handle,
	};
});

import { FlashListener } from "../../js/components/FlashListener";
import { __resetFlashHandlerRegistry, useFlashHandlers } from "../../js/hooks/useFlashHandlers";

function fireFlash(flash: unknown): void {
	for (const handler of Array.from(flashHandlers)) {
		handler({ detail: { flash } });
	}
}

/**
 * Many listener paths await a microtask (handler-resolution buffering window).
 * Wrap test arrangement in this so the buffered toast actually shows up before
 * we assert.
 */
async function flushMicrotasks(): Promise<void> {
	// Two ticks: one for the buffering window, one for any subsequent
	// then-callback chained off of it.
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

beforeEach(() => {
	flashHandlers.clear();
	cleanupSpy.mockClear();
	visitSpy.mockClear();
	toastShow.mockClear();
	toastShow.mockImplementation(() => "toast-id-1");
	toastHide.mockClear();
	__resetFlashHandlerRegistry();
});

afterEach(() => {
	__resetFlashHandlerRegistry();
});

describe("<FlashListener />", () => {
	it("subscribes on mount and cleans up on unmount", () => {
		const { unmount } = render(<FlashListener />);
		expect(flashHandlers.size).toBe(1);

		unmount();
		expect(flashHandlers.size).toBe(0);
		expect(cleanupSpy).toHaveBeenCalledTimes(1);
	});

	it("dispatches a toast payload to the bridge (happy path)", async () => {
		render(<FlashListener />);

		act(() => {
			fireFlash({ toast: { message: "X" } });
		});
		await flushMicrotasks();

		expect(toastShow).toHaveBeenCalledTimes(1);
		expect(toastShow).toHaveBeenCalledWith("X", {});
	});

	it("dispatches twice when two identical toast events fire in sequence", async () => {
		render(<FlashListener />);

		act(() => {
			fireFlash({ toast: { message: "X" } });
			fireFlash({ toast: { message: "X" } });
		});
		await flushMicrotasks();

		expect(toastShow).toHaveBeenCalledTimes(2);
	});

	it("forwards a banner payload to the onBanner callback", () => {
		const onBanner = vi.fn();
		render(<FlashListener onBanner={onBanner} />);

		const banner = {
			heading: "Heads up",
			tone: "warning" as const,
			description: "Something happened.",
		};
		act(() => {
			fireFlash({ banner });
		});

		expect(onBanner).toHaveBeenCalledTimes(1);
		expect(onBanner).toHaveBeenCalledWith(banner);
	});

	it("link-style toast action wraps onAction with router.visit", async () => {
		render(<FlashListener />);

		act(() => {
			fireFlash({
				toast: {
					message: "Saved",
					action: { label: "View", url: "/products/100" },
				},
			});
		});
		await flushMicrotasks();

		const opts = toastShow.mock.calls[0]?.[1];
		expect(opts?.action).toBe("View");
		expect(typeof opts?.onAction).toBe("function");

		opts?.onAction?.();
		expect(visitSpy).toHaveBeenCalledWith("/products/100");
	});

	it("named-handler action: registered async handler runs with params and toast hides on resolve", async () => {
		const { result } = renderHandlersHook();
		const asyncFn = vi.fn(() => Promise.resolve());

		act(() => {
			result.current.register("product.undo-delete", asyncFn);
		});

		render(<FlashListener />);

		act(() => {
			fireFlash({
				toast: {
					message: "Deleted",
					action: { label: "Undo", handler: "product.undo-delete", params: { id: 100 } },
				},
			});
		});
		await flushMicrotasks();

		const opts = toastShow.mock.calls[0]?.[1];
		expect(opts?.action).toBe("Undo");

		await act(async () => {
			opts?.onAction?.();
			await flushMicrotasks();
		});

		expect(asyncFn).toHaveBeenCalledTimes(1);
		expect(asyncFn).toHaveBeenCalledWith({ id: 100 });
		expect(toastHide).toHaveBeenCalledWith("toast-id-1");
	});

	it("named-handler action: unregistered handler omits action and warns", async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		render(<FlashListener />);

		act(() => {
			fireFlash({
				toast: {
					message: "Deleted",
					action: { label: "Undo", handler: "never-registered" },
				},
			});
		});
		await flushMicrotasks();

		expect(toastShow).toHaveBeenCalledTimes(1);
		const opts = toastShow.mock.calls[0]?.[1];
		expect(opts?.action).toBeUndefined();
		expect(opts?.onAction).toBeUndefined();
		expect(warnSpy).toHaveBeenCalled();
		expect(warnSpy.mock.calls[0]?.[0]).toContain("never-registered");

		warnSpy.mockRestore();
	});

	it("first-paint race: handler that registers within the buffering tick still wires the action", async () => {
		const { result } = renderHandlersHook();
		const fn = vi.fn();

		render(<FlashListener />);

		act(() => {
			fireFlash({
				toast: {
					message: "Saved",
					action: { label: "Undo", handler: "late.handler", params: { id: 1 } },
				},
			});
			// Register synchronously after firing — same tick, before the
			// microtask buffer drains.
			result.current.register("late.handler", fn);
		});

		await flushMicrotasks();

		const opts = toastShow.mock.calls[0]?.[1];
		expect(opts?.action).toBe("Undo");

		opts?.onAction?.();
		expect(fn).toHaveBeenCalledWith({ id: 1 });
	});

	it("lifetime scoping: a handler registered then unregistered before flash falls back to warning", async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { result } = renderHandlersHook();
		const fn = vi.fn();

		let cleanup!: () => void;
		act(() => {
			cleanup = result.current.register("product.undo-delete", fn);
		});
		act(() => {
			cleanup();
		});

		render(<FlashListener />);

		act(() => {
			fireFlash({
				toast: {
					message: "Deleted",
					action: { label: "Undo", handler: "product.undo-delete" },
				},
			});
		});
		await flushMicrotasks();

		const opts = toastShow.mock.calls[0]?.[1];
		expect(opts?.action).toBeUndefined();
		expect(fn).not.toHaveBeenCalled();
		expect(warnSpy).toHaveBeenCalled();

		warnSpy.mockRestore();
	});

	it("cross-tenant safety (architectural): handler signature receives only params", async () => {
		const { result } = renderHandlersHook();
		const seen: unknown[] = [];
		const fn = vi.fn((...args: unknown[]) => {
			seen.push(args);
		});

		act(() => {
			result.current.register("p.h", fn);
		});

		render(<FlashListener />);

		act(() => {
			fireFlash({
				toast: {
					message: "x",
					action: { label: "Go", handler: "p.h", params: { id: 100 } },
				},
			});
		});
		await flushMicrotasks();

		const opts = toastShow.mock.calls[0]?.[1];
		opts?.onAction?.();

		expect(seen).toHaveLength(1);
		expect(seen[0]).toEqual([{ id: 100 }]);
	});

	it("handler that throws synchronously: error is logged and toast does not auto-dismiss", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const { result } = renderHandlersHook();
		const boom = vi.fn(() => {
			throw new Error("nope");
		});

		act(() => {
			result.current.register("boom", boom);
		});

		render(<FlashListener />);

		act(() => {
			fireFlash({
				toast: {
					message: "x",
					action: { label: "Go", handler: "boom" },
				},
			});
		});
		await flushMicrotasks();

		const opts = toastShow.mock.calls[0]?.[1];
		opts?.onAction?.();

		expect(errorSpy).toHaveBeenCalled();
		expect(toastHide).not.toHaveBeenCalled();

		errorSpy.mockRestore();
	});

	it("async handler that rejects: error is logged and toast does not auto-dismiss", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const { result } = renderHandlersHook();
		const reject = vi.fn(() => Promise.reject(new Error("rejected")));

		act(() => {
			result.current.register("rej", reject);
		});

		render(<FlashListener />);

		act(() => {
			fireFlash({
				toast: {
					message: "x",
					action: { label: "Go", handler: "rej" },
				},
			});
		});
		await flushMicrotasks();

		const opts = toastShow.mock.calls[0]?.[1];
		await act(async () => {
			opts?.onAction?.();
			await flushMicrotasks();
		});

		expect(errorSpy).toHaveBeenCalled();
		expect(toastHide).not.toHaveBeenCalled();

		errorSpy.mockRestore();
	});

	it("re-rendering the parent with a new inline onBanner does not re-subscribe", () => {
		function Parent({ tag }: { tag: number }) {
			// Inline arrow swaps identity each render — should NOT cause router.on
			// to fire again because we read the callback through a ref.
			return <FlashListener onBanner={() => void tag} />;
		}

		const { rerender } = render(<Parent tag={1} />);
		expect(flashHandlers.size).toBe(1);

		rerender(<Parent tag={2} />);
		rerender(<Parent tag={3} />);

		// One subscription, no extra cleanups.
		expect(flashHandlers.size).toBe(1);
		expect(cleanupSpy).not.toHaveBeenCalled();
	});

	it("unmount during async handler resolution does not call hideToast post-unmount", async () => {
		const { result } = renderHandlersHook();
		let resolveAction: (() => void) | undefined;
		const slow = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					resolveAction = () => resolve();
				}),
		);

		act(() => {
			result.current.register("slow.handler", slow);
		});

		const { unmount } = render(<FlashListener />);

		act(() => {
			fireFlash({
				toast: {
					message: "x",
					action: { label: "Go", handler: "slow.handler" },
				},
			});
		});
		await flushMicrotasks();

		const opts = toastShow.mock.calls[0]?.[1];
		opts?.onAction?.();

		// Unmount BEFORE the async handler resolves.
		unmount();

		await act(async () => {
			resolveAction?.();
			await flushMicrotasks();
		});

		expect(toastHide).not.toHaveBeenCalled();
	});

	it("registry calls are stable across re-renders (does not loop when used as effect dep)", () => {
		const { result, rerender } = renderHandlersHook();
		const first = result.current;
		rerender();
		const second = result.current;

		expect(second.register).toBe(first.register);
		expect(second.unregister).toBe(first.unregister);
	});
});

// Helper: a thin wrapper around renderHook for useFlashHandlers so we don't
// need to import renderHook in every test that needs it.
import { renderHook } from "@testing-library/react";
function renderHandlersHook(): ReturnType<typeof renderHook<ReturnType<typeof useFlashHandlers>, void>> {
	return renderHook(() => useFlashHandlers());
}
