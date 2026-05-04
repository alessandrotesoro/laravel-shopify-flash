import { describe, expect, it, vi } from "vitest";
import { hideToast, showToast } from "../../js/bridge/toast-bridge";
import type { ShopifyApiLike } from "../../js/bridge/toast-bridge";

function makeShopify(): ShopifyApiLike & {
	toast: { show: ReturnType<typeof vi.fn>; hide: ReturnType<typeof vi.fn> };
} {
	return {
		toast: {
			show: vi.fn(() => "toast-id-1"),
			hide: vi.fn(),
		},
	};
}

describe("toast-bridge", () => {
	it("forwards a minimal toast payload to shopify.toast.show", () => {
		const shopify = makeShopify();
		const id = showToast({ message: "Hello" }, {}, shopify);

		expect(shopify.toast.show).toHaveBeenCalledTimes(1);
		expect(shopify.toast.show).toHaveBeenCalledWith("Hello", {});
		expect(id).toBe("toast-id-1");
	});

	it("passes duration and isError through when present", () => {
		const shopify = makeShopify();
		showToast({ message: "Boom", duration: 8000, isError: true }, {}, shopify);

		expect(shopify.toast.show).toHaveBeenCalledWith("Boom", {
			duration: 8000,
			isError: true,
		});
	});

	it("wires action label + onAction when both payload action and callback are present", () => {
		const shopify = makeShopify();
		const onAction = vi.fn();

		showToast(
			{
				message: "File deleted",
				action: { label: "Undo", handler: "x" },
			},
			{ onAction },
			shopify,
		);

		const opts = shopify.toast.show.mock.calls[0]?.[1];
		expect(opts).toMatchObject({ action: "Undo" });
		expect(opts?.onAction).toBe(onAction);
	});

	it("omits the action button when payload has an action but no onAction callback", () => {
		const shopify = makeShopify();

		showToast(
			{
				message: "File deleted",
				action: { label: "Undo", handler: "x" },
			},
			{},
			shopify,
		);

		const opts = shopify.toast.show.mock.calls[0]?.[1];
		expect(opts?.action).toBeUndefined();
		expect(opts?.onAction).toBeUndefined();
	});

	it("forwards onDismiss callback", () => {
		const shopify = makeShopify();
		const onDismiss = vi.fn();

		showToast({ message: "Hi" }, { onDismiss }, shopify);

		expect(shopify.toast.show.mock.calls[0]?.[1]?.onDismiss).toBe(onDismiss);
	});

	it("hideToast forwards id to shopify.toast.hide", () => {
		const shopify = makeShopify();
		hideToast("abc", shopify);
		expect(shopify.toast.hide).toHaveBeenCalledWith("abc");
	});
});
