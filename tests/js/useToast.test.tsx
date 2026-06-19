import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { toastShow, toastHide } = vi.hoisted(() => ({
	toastShow: vi.fn(() => "toast-id-1"),
	toastHide: vi.fn(),
}));

vi.mock("@shopify/app-bridge-react", () => {
	const handle = { toast: { show: toastShow, hide: toastHide } };
	return { useAppBridge: () => handle };
});

import { useToast } from "../../js/hooks/useToast";

beforeEach(() => {
	toastShow.mockClear();
	toastShow.mockImplementation(() => "toast-id-1");
	toastHide.mockClear();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("useToast", () => {
	it("success() shows a plain toast and returns the bridge id", () => {
		const { result } = renderHook(() => useToast());

		const id = result.current.success("File deleted");

		expect(toastShow).toHaveBeenCalledTimes(1);
		expect(toastShow.mock.calls[0]?.[0]).toBe("File deleted");
		expect(toastShow.mock.calls[0]?.[1]).not.toMatchObject({ isError: true });
		expect(id).toBe("toast-id-1");
	});

	it("error() shows an error-styled toast and returns the bridge id", () => {
		const { result } = renderHook(() => useToast());

		const id = result.current.error("Upload failed");

		expect(toastShow.mock.calls[0]?.[0]).toBe("Upload failed");
		expect(toastShow.mock.calls[0]?.[1]).toMatchObject({ isError: true });
		expect(id).toBe("toast-id-1");
	});

	it("show() forwards a full ToastPayload (duration carried)", () => {
		const { result } = renderHook(() => useToast());

		result.current.show({ message: "Saved", duration: 5000 });

		expect(toastShow.mock.calls[0]?.[0]).toBe("Saved");
		expect(toastShow.mock.calls[0]?.[1]).toMatchObject({ duration: 5000 });
	});

	it("hide() hides a toast by id via the bridge", () => {
		const { result } = renderHook(() => useToast());

		result.current.hide("toast-id-1");

		expect(toastHide).toHaveBeenCalledWith("toast-id-1");
	});

	it("returns stable callback identities across re-renders", () => {
		const { result, rerender } = renderHook(() => useToast());
		const first = result.current;

		rerender();

		expect(result.current.success).toBe(first.success);
		expect(result.current.error).toBe(first.error);
		expect(result.current.show).toBe(first.show);
		expect(result.current.hide).toBe(first.hide);
	});

	it("swallows bridge failures (matches showToast's catch contract)", () => {
		toastShow.mockImplementation(() => {
			throw new Error("bridge down");
		});
		const { result } = renderHook(() => useToast());

		expect(() => result.current.success("Whatever")).not.toThrow();
	});
});
