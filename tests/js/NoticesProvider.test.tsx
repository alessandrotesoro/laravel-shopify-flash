import { act, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { visitSpy, usePageMock } = vi.hoisted(() => ({
	visitSpy: vi.fn(),
	usePageMock: vi.fn(() => ({ props: {} })),
}));

vi.mock("@inertiajs/react", () => ({
	router: { visit: visitSpy },
	usePage: usePageMock,
}));

import { NoticeBanner } from "../../js/components/NoticeBanner";
import { NoticesContainer } from "../../js/components/NoticesContainer";
import { NoticesProvider } from "../../js/components/NoticesProvider";
import { useFlashNotice } from "../../js/hooks/useFlashNotice";
import { useNotices } from "../../js/hooks/useNotices";

beforeEach(() => {
	visitSpy.mockClear();
	usePageMock.mockReset();
	usePageMock.mockReturnValue({ props: {} });
});

afterEach(() => {
	vi.restoreAllMocks();
});

function wrapper({ children }: { children: ReactNode }) {
	return <NoticesProvider>{children}</NoticesProvider>;
}

describe("<NoticesProvider /> + useNotices()", () => {
	it("add() returns a string id and exposes the entry through items", () => {
		const { result } = renderHook(() => useNotices(), { wrapper });

		let id = "";
		act(() => {
			id = result.current.add({ heading: "Hi", tone: "info" });
		});

		expect(typeof id).toBe("string");
		expect(id.length).toBeGreaterThan(0);
		expect(result.current.items).toHaveLength(1);
		expect(result.current.items[0]).toMatchObject({ id, heading: "Hi", tone: "info" });
	});

	it("remove(id) drops a single entry; clear() empties the stack", () => {
		const { result } = renderHook(() => useNotices(), { wrapper });

		let firstId = "";
		let secondId = "";
		act(() => {
			firstId = result.current.add({ heading: "A", tone: "info" });
			secondId = result.current.add({ heading: "B", tone: "warning" });
		});
		expect(result.current.items).toHaveLength(2);

		act(() => {
			result.current.remove(firstId);
		});
		expect(result.current.items).toHaveLength(1);
		expect(result.current.items[0]?.id).toBe(secondId);

		act(() => {
			result.current.clear();
		});
		expect(result.current.items).toHaveLength(0);
	});

	it("convenience methods set the tone correctly", () => {
		const { result } = renderHook(() => useNotices(), { wrapper });

		act(() => {
			result.current.info({ heading: "I" });
			result.current.success({ heading: "S" });
			result.current.warning({ heading: "W" });
			result.current.critical({ heading: "C" });
		});

		expect(result.current.items.map((n) => n.tone)).toEqual([
			"info",
			"success",
			"warning",
			"critical",
		]);
	});

	it("useNotices() outside <NoticesProvider /> throws a clear error", () => {
		// renderHook with no wrapper triggers the missing-context branch.
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		expect(() => renderHook(() => useNotices())).toThrow(
			/useNotices must be used within a <NoticesProvider \/>/,
		);
		errorSpy.mockRestore();
	});

	it("clear() removes a non-dismissable notice programmatically", () => {
		const { result } = renderHook(() => useNotices(), { wrapper });

		act(() => {
			result.current.add({ heading: "Forced", tone: "critical", dismissible: false });
		});
		expect(result.current.items).toHaveLength(1);

		act(() => {
			result.current.clear();
		});
		expect(result.current.items).toHaveLength(0);
	});
});

describe("<NoticesContainer />", () => {
	it("returns null when no notices are present", () => {
		const { container } = render(
			<NoticesProvider>
				<NoticesContainer />
			</NoticesProvider>,
		);
		expect(container.querySelector("s-stack")).toBeNull();
		expect(container.querySelector("s-banner")).toBeNull();
	});

	it("renders one <s-banner> per notice with the right attributes", () => {
		function Harness() {
			const { add } = useNotices();
			return (
				<>
					<button
						type="button"
						data-testid="add"
						onClick={() => {
							add({
								heading: "Saved",
								tone: "success",
								description: "All good.",
								actions: [{ label: "View", url: "/products/100" }],
							});
						}}
					>
						add
					</button>
					<NoticesContainer />
				</>
			);
		}

		const { container } = render(
			<NoticesProvider>
				<Harness />
			</NoticesProvider>,
		);
		act(() => {
			screen.getByTestId("add").click();
		});

		const banners = container.querySelectorAll("s-banner");
		expect(banners).toHaveLength(1);
		expect(banners[0]?.getAttribute("heading")).toBe("Saved");
		expect(banners[0]?.getAttribute("tone")).toBe("success");

		const buttons = container.querySelectorAll("s-button");
		expect(buttons).toHaveLength(1);
		expect(buttons[0]?.getAttribute("slot")).toBe("secondary-actions");
		expect(buttons[0]?.textContent).toBe("View");
	});

	it("link-action click navigates via router.visit", () => {
		function Harness() {
			const { add } = useNotices();
			return (
				<>
					<button
						type="button"
						data-testid="add"
						onClick={() => {
							add({
								heading: "X",
								tone: "warning",
								actions: [{ label: "Go", url: "/somewhere" }],
							});
						}}
					>
						add
					</button>
					<NoticesContainer />
				</>
			);
		}

		const { container } = render(
			<NoticesProvider>
				<Harness />
			</NoticesProvider>,
		);
		act(() => {
			screen.getByTestId("add").click();
		});

		const button = container.querySelector("s-button") as HTMLElement;
		act(() => {
			button.click();
		});

		expect(visitSpy).toHaveBeenCalledWith("/somewhere");
	});

	it("dismiss → afterhide removes the notice from context", () => {
		function Harness() {
			const { add, items } = useNotices();
			return (
				<>
					<button
						type="button"
						data-testid="add"
						onClick={() => {
							add({ heading: "Z", tone: "info" });
						}}
					>
						add
					</button>
					<div data-testid="count">{items.length}</div>
					<NoticesContainer />
				</>
			);
		}

		const { container } = render(
			<NoticesProvider>
				<Harness />
			</NoticesProvider>,
		);
		act(() => {
			screen.getByTestId("add").click();
		});
		expect(screen.getByTestId("count").textContent).toBe("1");

		const banner = container.querySelector("s-banner") as HTMLElement;
		// The web component would fire `dismiss` when the user clicks the
		// dismiss icon. Simulate it — for custom elements with React on* props,
		// React 19 attaches the handler via addEventListener under the hood.
		act(() => {
			banner.dispatchEvent(new Event("dismiss"));
		});
		// Banner should now be hidden but still in the DOM (animation in flight).
		expect(banner.hasAttribute("hidden")).toBe(true);
		expect(screen.getByTestId("count").textContent).toBe("1");

		// Web component finishes its exit animation and fires `afterhide`.
		act(() => {
			banner.dispatchEvent(new Event("afterhide"));
		});
		expect(screen.getByTestId("count").textContent).toBe("0");
	});

	it("dismissible: false renders no `dismissible` attribute", () => {
		function Harness() {
			const { add } = useNotices();
			return (
				<>
					<button
						type="button"
						data-testid="add"
						onClick={() => {
							add({ heading: "Forced", tone: "critical", dismissible: false });
						}}
					>
						add
					</button>
					<NoticesContainer />
				</>
			);
		}

		const { container } = render(
			<NoticesProvider>
				<Harness />
			</NoticesProvider>,
		);
		act(() => {
			screen.getByTestId("add").click();
		});

		const banner = container.querySelector("s-banner") as HTMLElement;
		expect(banner.hasAttribute("dismissible")).toBe(false);
	});
});

describe("<NoticeBanner />", () => {
	it("can be rendered directly with a notice prop", () => {
		const { container } = render(
			<NoticesProvider>
				<NoticeBanner
					notice={{
						id: "manual-1",
						heading: "Hello",
						tone: "info",
						description: "World",
					}}
				/>
			</NoticesProvider>,
		);
		const banner = container.querySelector("s-banner");
		expect(banner?.getAttribute("heading")).toBe("Hello");
	});
});

describe("useFlashNotice() (deprecated transitional drain)", () => {
	it("drains the shared flash.notice prop into context once per page change", () => {
		const noticeA = { heading: "A", tone: "warning" as const };
		usePageMock.mockReturnValue({ props: { flash: { notice: noticeA } } });

		function Harness() {
			useFlashNotice();
			const { items } = useNotices();
			return <div data-testid="count">{items.length}</div>;
		}

		const { rerender } = render(
			<NoticesProvider>
				<Harness />
			</NoticesProvider>,
		);
		expect(screen.getByTestId("count").textContent).toBe("1");

		// Same payload reference on re-render → no double-add.
		rerender(
			<NoticesProvider>
				<Harness />
			</NoticesProvider>,
		);
		expect(screen.getByTestId("count").textContent).toBe("1");

		// New payload reference (= page change) → adds again.
		usePageMock.mockReturnValue({
			props: { flash: { notice: { heading: "B", tone: "info" as const } } },
		});
		rerender(
			<NoticesProvider>
				<Harness />
			</NoticesProvider>,
		);
		expect(screen.getByTestId("count").textContent).toBe("2");
	});
});
